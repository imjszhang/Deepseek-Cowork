/**
 * Callback Manager Module
 * 
 * Manages HTTP callback requests and responses with lifecycle management:
 * - Request status tracking (pending -> processing -> completed/timeout/error)
 * - Automatic timeout handling
 * - Expired response cleanup
 * - Event emission for push notifications
 */

const axios = require('axios');
const { EventEmitter } = require('events');
const Logger = require('./logger');

class CallbackManager extends EventEmitter {
  /**
   * Constructor
   * @param {Object} database Database instance
   * @param {Object} options Configuration options
   */
  constructor(database, options = {}) {
    super();
    this.database = database;
    this.logger = Logger;
    
    // Configuration
    this.requestTTL = options.requestTTL || 60000;           // 60 seconds default timeout
    this.responseRetention = options.responseRetention || 300000;  // 5 minutes retention
    this.timeoutCheckInterval = options.timeoutCheckInterval || 5000;  // Check every 5 seconds
    this.cleanupInterval = options.cleanupInterval || 30000;  // Cleanup every 30 seconds
    
    // Internal state
    this.timeoutWatcher = null;
    this.cleanupTimer = null;
    this.isRunning = false;
    
    // In-memory tracking for faster access
    this.pendingRequests = new Map();  // requestId -> { createdAt, ttl, operationType }
  }

  /**
   * Start the timeout watcher and cleanup timers
   */
  start() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    // Start timeout watcher
    this.timeoutWatcher = setInterval(() => {
      this.checkTimeouts().catch(err => {
        this.logger.error(`Timeout check error: ${err.message}`);
      });
    }, this.timeoutCheckInterval);
    
    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredResponses().catch(err => {
        this.logger.error(`Cleanup error: ${err.message}`);
      });
    }, this.cleanupInterval);
    
    this.logger.info(`CallbackManager started (timeout: ${this.requestTTL}ms, retention: ${this.responseRetention}ms)`);
  }

  /**
   * Stop the timeout watcher and cleanup timers
   */
  stop() {
    if (this.timeoutWatcher) {
      clearInterval(this.timeoutWatcher);
      this.timeoutWatcher = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.isRunning = false;
    this.pendingRequests.clear();
    this.logger.info('CallbackManager stopped');
  }

  /**
   * Update configuration
   * @param {Object} options New configuration options
   */
  updateConfig(options) {
    if (options.requestTTL) this.requestTTL = options.requestTTL;
    if (options.responseRetention) this.responseRetention = options.responseRetention;
    if (options.timeoutCheckInterval) this.timeoutCheckInterval = options.timeoutCheckInterval;
    if (options.cleanupInterval) this.cleanupInterval = options.cleanupInterval;
    
    // Restart timers with new intervals if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Register callback URL with lifecycle tracking
   * @param {string} requestId Request ID
   * @param {string} callbackUrl Callback URL
   * @param {Object} options Registration options
   * @param {string} options.operationType Type of operation (e.g., 'execute_script', 'open_url')
   * @param {number} options.ttl Custom TTL in milliseconds
   * @returns {Promise<boolean>} Success/failure
   */
  async registerCallback(requestId, callbackUrl, options = {}) {
    try {
      if (!requestId) {
        this.logger.error('Missing required parameter when registering callback');
        return false;
      }

      if (callbackUrl === "_internal" || !callbackUrl) {
        callbackUrl = "_internal";
      }

      const ttl = options.ttl || this.requestTTL;
      const operationType = options.operationType || null;
      const createdAt = Date.now();

      await this.database.run(
        `INSERT OR REPLACE INTO callbacks 
         (request_id, callback_url, status, operation_type, ttl_ms, created_at) 
         VALUES (?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)`,
        [requestId, callbackUrl, operationType, ttl]
      );
      
      // Track in memory for faster timeout checks
      this.pendingRequests.set(requestId, {
        createdAt,
        ttl,
        operationType,
        callbackUrl
      });
      
      this.logger.info(`Registered callback [${requestId}]: ${callbackUrl} (ttl: ${ttl}ms, op: ${operationType})`);
      return true;
    } catch (err) {
      this.logger.error(`Error registering callback URL: ${err.message}`);
      return false;
    }
  }

  /**
   * Update callback status
   * @param {string} requestId Request ID
   * @param {string} status New status ('pending', 'processing', 'completed', 'timeout', 'error')
   * @returns {Promise<boolean>} Success/failure
   */
  async updateCallbackStatus(requestId, status) {
    try {
      await this.database.run(
        'UPDATE callbacks SET status = ? WHERE request_id = ?',
        [status, requestId]
      );
      
      // Remove from pending if completed/timeout/error
      if (status !== 'pending' && status !== 'processing') {
        this.pendingRequests.delete(requestId);
      }
      
      return true;
    } catch (err) {
      this.logger.error(`Error updating callback status: ${err.message}`);
      return false;
    }
  }

  /**
   * Get callback status
   * @param {string} requestId Request ID
   * @returns {Promise<string|null>} Status or null
   */
  async getCallbackStatus(requestId) {
    try {
      const row = await this.database.get(
        'SELECT status FROM callbacks WHERE request_id = ?',
        [requestId]
      );
      return row ? row.status : null;
    } catch (err) {
      this.logger.error(`Error getting callback status: ${err.message}`);
      return null;
    }
  }

  /**
   * Send response to registered callback URL
   * @param {string} requestId Request ID
   * @param {Object} data Response data
   * @returns {Promise<boolean>} Success/failure
   */
  async postToCallback(requestId, data) {
    try {
      if (!requestId) {
        this.logger.error('Missing request ID when sending callback');
        return false;
      }

      // Determine final status based on response data
      const status = data.status === 'error' ? 'error' : 'completed';
      
      // Update callback status
      await this.updateCallbackStatus(requestId, status);

      // Save response data to database
      await this.saveCallbackResponse(requestId, data);
      
      // Remove from pending requests
      this.pendingRequests.delete(requestId);

      // Emit event for push notifications (SSE/WebSocket)
      this.emit('callback_result', {
        requestId,
        status,
        data,
        timestamp: new Date().toISOString()
      });

      // Get callback URL from database
      const callbackInfo = await this.database.get(
        'SELECT callback_url FROM callbacks WHERE request_id = ?',
        [requestId]
      );

      // For internal callbacks, only save response
      if (!callbackInfo || callbackInfo.callback_url === "_internal") {
        this.logger.info(`Internal callback for request ID ${requestId}, response saved`);
        return true;
      }

      // If callback URL exists, send HTTP POST request
      const callbackUrl = callbackInfo.callback_url;
      if (callbackUrl) {
        try {
          const response = await axios.post(callbackUrl, data, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000  // 10 second timeout for callback delivery
          });
          
          this.logger.info(`Callback [${requestId}] sent to ${callbackUrl}, status: ${response.status}`);
          return response.status >= 200 && response.status < 300;
        } catch (err) {
          this.logger.error(`Error sending callback request [${requestId}]: ${err.message}`);
          return false;
        }
      }

      return true;
    } catch (err) {
      this.logger.error(`Error processing callback: ${err.message}`);
      return false;
    }
  }

  /**
   * Save callback response
   * @param {string} requestId Request ID
   * @param {Object} data Response data
   * @returns {Promise<boolean>} Success/failure
   */
  async saveCallbackResponse(requestId, data) {
    try {
      const responseData = JSON.stringify(data);
      
      await this.database.run(
        'INSERT OR REPLACE INTO callback_responses (request_id, response_data) VALUES (?, ?)',
        [requestId, responseData]
      );
      
      this.logger.info(`Saved callback response [${requestId}]`);
      return true;
    } catch (err) {
      this.logger.error(`Error saving callback response: ${err.message}`);
      return false;
    }
  }

  /**
   * Get callback URL
   * @param {string} requestId Request ID
   * @returns {Promise<string|null>} Callback URL
   */
  async getCallbackUrl(requestId) {
    try {
      const row = await this.database.get(
        'SELECT callback_url FROM callbacks WHERE request_id = ?',
        [requestId]
      );

      return row ? row.callback_url : null;
    } catch (err) {
      this.logger.error(`Error getting callback URL: ${err.message}`);
      return null;
    }
  }

  /**
   * Get callback response
   * @param {string} requestId Request ID
   * @returns {Promise<Object|null>} Response data
   */
  async getCallbackResponse(requestId) {
    try {
      const row = await this.database.get(
        'SELECT response_data FROM callback_responses WHERE request_id = ?',
        [requestId]
      );

      if (row && row.response_data) {
        try {
          return JSON.parse(row.response_data);
        } catch (err) {
          this.logger.error(`Error parsing callback response data: ${err.message}`);
          return null;
        }
      }
      
      return null;
    } catch (err) {
      this.logger.error(`Error getting callback response: ${err.message}`);
      return null;
    }
  }

  /**
   * Cleanup expired callback records
   * @returns {Promise<number>} Number of records cleaned up
   */
  async cleanupExpiredCallbacks() {
    try {
      const result = await this.database.run(
        'DELETE FROM callbacks WHERE expires_at < CURRENT_TIMESTAMP'
      );
      
      this.logger.info(`Cleaned up ${result.changes} expired callback records`);
      return result.changes;
    } catch (err) {
      this.logger.error(`Error cleaning up expired callback records: ${err.message}`);
      return 0;
    }
  }

  /**
   * Check for timed out requests and generate timeout responses
   * @returns {Promise<number>} Number of timed out requests handled
   */
  async checkTimeouts() {
    const now = Date.now();
    let timeoutCount = 0;
    
    try {
      // Check in-memory pending requests first (faster)
      const timedOutIds = [];
      
      for (const [requestId, info] of this.pendingRequests) {
        if (now - info.createdAt > info.ttl) {
          timedOutIds.push(requestId);
        }
      }
      
      // Also check database for any pending requests not in memory
      const dbPending = await this.database.all(
        `SELECT request_id, ttl_ms, created_at 
         FROM callbacks 
         WHERE status = 'pending' 
         AND datetime(created_at, '+' || (ttl_ms / 1000) || ' seconds') < datetime('now')`,
        []
      );
      
      for (const row of dbPending) {
        if (!timedOutIds.includes(row.request_id)) {
          timedOutIds.push(row.request_id);
        }
      }
      
      // Process timed out requests
      for (const requestId of timedOutIds) {
        await this.handleTimeout(requestId);
        timeoutCount++;
      }
      
      if (timeoutCount > 0) {
        this.logger.info(`Handled ${timeoutCount} timed out request(s)`);
      }
      
      return timeoutCount;
    } catch (err) {
      this.logger.error(`Error checking timeouts: ${err.message}`);
      return 0;
    }
  }

  /**
   * Handle a single request timeout
   * @param {string} requestId Request ID that timed out
   */
  async handleTimeout(requestId) {
    try {
      const info = this.pendingRequests.get(requestId);
      const operationType = info?.operationType || 'unknown';
      
      // Update status to timeout
      await this.updateCallbackStatus(requestId, 'timeout');
      
      // Generate timeout response
      const timeoutResponse = {
        status: 'error',
        type: 'timeout',
        requestId,
        message: `Request timed out after ${info?.ttl || this.requestTTL}ms`,
        operationType,
        timestamp: new Date().toISOString()
      };
      
      // Save timeout response
      await this.saveCallbackResponse(requestId, timeoutResponse);
      
      // Remove from pending
      this.pendingRequests.delete(requestId);
      
      // Emit timeout event
      this.emit('callback_result', {
        requestId,
        status: 'timeout',
        data: timeoutResponse,
        timestamp: new Date().toISOString()
      });
      
      this.emit('request_timeout', {
        requestId,
        operationType,
        timestamp: new Date().toISOString()
      });
      
      this.logger.warn(`Request [${requestId}] timed out (operation: ${operationType})`);
    } catch (err) {
      this.logger.error(`Error handling timeout for [${requestId}]: ${err.message}`);
    }
  }

  /**
   * Cleanup expired responses from the database
   * @returns {Promise<number>} Number of responses cleaned up
   */
  async cleanupExpiredResponses() {
    try {
      // Clean up old callback records (completed/timeout/error older than retention period)
      const callbackResult = await this.database.run(
        `DELETE FROM callbacks 
         WHERE status IN ('completed', 'timeout', 'error') 
         AND datetime(created_at, '+' || (? / 1000) || ' seconds') < datetime('now')`,
        [this.responseRetention]
      );
      
      // Clean up old response records
      const responseResult = await this.database.run(
        `DELETE FROM callback_responses 
         WHERE expires_at < CURRENT_TIMESTAMP`
      );
      
      const totalCleaned = (callbackResult.changes || 0) + (responseResult.changes || 0);
      
      if (totalCleaned > 0) {
        this.logger.info(`Cleaned up ${callbackResult.changes || 0} callbacks, ${responseResult.changes || 0} responses`);
      }
      
      return totalCleaned;
    } catch (err) {
      this.logger.error(`Error cleaning up expired responses: ${err.message}`);
      return 0;
    }
  }

  /**
   * Get statistics about pending requests
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      pendingCount: this.pendingRequests.size,
      isRunning: this.isRunning,
      config: {
        requestTTL: this.requestTTL,
        responseRetention: this.responseRetention,
        timeoutCheckInterval: this.timeoutCheckInterval,
        cleanupInterval: this.cleanupInterval
      }
    };
  }

  /**
   * Check if a request is still pending
   * @param {string} requestId Request ID
   * @returns {boolean} True if pending
   */
  isPending(requestId) {
    return this.pendingRequests.has(requestId);
  }

  /**
   * Get pending request count
   * @returns {number} Number of pending requests
   */
  getPendingCount() {
    return this.pendingRequests.size;
  }
}

module.exports = CallbackManager;
