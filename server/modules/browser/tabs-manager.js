/**
 * Tabs Manager Module
 * 
 * Manages browser tab information and content
 */

const Logger = require('./logger');

class TabsManager {
  /**
   * Constructor
   * @param {Object} database Database instance
   * @param {Object} callbackManager Callback manager instance
   */
  constructor(database, callbackManager) {
    this.database = database;
    this.callbackManager = callbackManager;
    this.logger = Logger;
    this.lastKnownTabCount = 0;
    this.lastKnownActiveTabId = null;
    
    // Queue for managing cookie saves per tab to avoid concurrent conflicts
    this.cookiesSaveQueues = new Map();
    
    // Periodic cleanup of completed queues to prevent memory leaks
    this.queueCleanupTimer = setInterval(() => {
      this.cleanupCompletedQueues();
    }, 60000); // Clean up every minute
  }

  /**
   * Get all tabs
   * @returns {Promise<Array>} Tab list
   */
  async getTabs() {
    try {
      const tabs = await this.database.all('SELECT * FROM tabs ORDER BY window_id, index_in_window');
      this.lastKnownTabCount = tabs.length;
      return { status: 'success', tabs };
    } catch (err) {
      this.logger.error(`Error getting tabs: ${err.message}`);
      return { status: 'error', message: err.message };
    }
  }

  /**
   * Save cookies to independent cookies table (queued to avoid concurrent conflicts)
   * @param {string} tabId Tab ID (for queue management and logging)
   * @param {Array} cookies Cookies array
   * @returns {Promise<boolean>} Success/failure
   */
  async saveCookies(tabId, cookies) {
    if (!this.cookiesSaveQueues.has(tabId)) {
      this.cookiesSaveQueues.set(tabId, Promise.resolve());
    }

    const currentQueue = this.cookiesSaveQueues.get(tabId);
    const newQueue = currentQueue.then(async () => {
      return this._saveCookiesInternal(tabId, cookies);
    }).catch(error => {
      this.logger.error(`Tab ${tabId} cookies save queue error: ${error.message}`);
      return false;
    });

    this.cookiesSaveQueues.set(tabId, newQueue);
    return newQueue;
  }

  /**
   * Internal cookies save method
   * @param {string} tabId Tab ID (for logging only)
   * @param {Array} cookies Cookies array
   * @returns {Promise<boolean>} Success/failure
   */
  async _saveCookiesInternal(tabId, cookies) {
    try {
      if (!Array.isArray(cookies)) {
        this.logger.error('Invalid parameter when saving cookies: cookies must be an array');
        return false;
      }

      this.logger.info(`Starting to save ${cookies.length} cookies${tabId ? ` (source tab: ${tabId})` : ''}`);

      // Data validation and preprocessing
      const validCookies = [];
      const invalidCookies = [];

      for (const cookie of cookies) {
        try {
          if (!cookie.name || typeof cookie.name !== 'string') {
            throw new Error('Invalid cookie name');
          }
          
          if (cookie.name.length > 4096 || (cookie.value && cookie.value.length > 4096)) {
            throw new Error('Cookie name or value too long');
          }

          // sameSite value normalization
          let normalizedSameSite = 'no_restriction';
          if (cookie.sameSite) {
            const sameSiteMap = {
              'none': 'no_restriction',
              'no_restriction': 'no_restriction',
              'lax': 'lax',
              'strict': 'strict',
              'unspecified': 'unspecified'
            };
            normalizedSameSite = sameSiteMap[cookie.sameSite.toLowerCase()] || 'unspecified';
          }

          const mappedCookie = {
            name: cookie.name,
            value: cookie.value || '',
            domain: cookie.domain || '',
            path: cookie.path || '/',
            secure: Boolean(cookie.secure),
            httpOnly: Boolean(cookie.httpOnly),
            sameSite: normalizedSameSite,
            expirationDate: cookie.expirationDate || null,
            session: Boolean(cookie.session),
            storeId: cookie.storeId || null
          };

          validCookies.push(mappedCookie);
          
        } catch (validationErr) {
          invalidCookies.push({
            cookie: cookie,
            error: validationErr.message
          });
        }
      }

      if (invalidCookies.length > 0) {
        this.logger.warn(`Tab ${tabId} has ${invalidCookies.length} invalid cookies:`, 
          invalidCookies.map(item => `${item.cookie.name}: ${item.error}`));
      }

      if (validCookies.length === 0) {
        this.logger.warn(`Tab ${tabId} has no valid cookies to save`);
        return true;
      }

      // Use transaction for batch save
      const queries = [];
      const paramsArray = [];

      for (const mappedCookie of validCookies) {
        queries.push(
          `INSERT OR REPLACE INTO cookies (
            name, value, domain, path, secure, http_only, 
            same_site, expiration_date, session, store_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        
        paramsArray.push([
          mappedCookie.name,
          mappedCookie.value,
          mappedCookie.domain,
          mappedCookie.path,
          mappedCookie.secure ? 1 : 0,
          mappedCookie.httpOnly ? 1 : 0,
          mappedCookie.sameSite,
          mappedCookie.expirationDate,
          mappedCookie.session ? 1 : 0,
          mappedCookie.storeId
        ]);
      }

      await this.database.runTransaction(queries, paramsArray);

      this.logger.info(`Successfully saved ${validCookies.length} cookies for tab ${tabId}` + 
        (invalidCookies.length > 0 ? `, skipped ${invalidCookies.length} invalid cookies` : ''));
      
      return true;
      
    } catch (err) {
      this.logger.error(`Error saving cookies: ${err.message}`, {
        tabId,
        cookieCount: cookies.length,
        error: err.stack
      });
      return false;
    }
  }

  /**
   * Cleanup completed cookie save queues
   */
  cleanupCompletedQueues() {
    const toDelete = [];
    
    for (const [tabId, queue] of this.cookiesSaveQueues.entries()) {
      Promise.race([queue, Promise.resolve('timeout')])
        .then(result => {
          if (result !== 'timeout') {
            toDelete.push(tabId);
          }
        })
        .catch(() => {
          toDelete.push(tabId);
        });
    }
    
    for (const tabId of toDelete) {
      this.cookiesSaveQueues.delete(tabId);
    }
    
    if (toDelete.length > 0) {
      this.logger.debug(`Cleaned up ${toDelete.length} completed cookie save queues`);
    }
  }

  /**
   * Destroy TabsManager and cleanup resources
   */
  destroy() {
    if (this.queueCleanupTimer) {
      clearInterval(this.queueCleanupTimer);
      this.queueCleanupTimer = null;
    }
    
    this.cookiesSaveQueues.clear();
    this.logger.info('TabsManager destroyed, resources cleaned up');
  }

  /**
   * Get cookies for a tab (based on URL domain matching)
   * @param {string} tabId Tab ID
   * @param {string} url Optional URL
   * @returns {Promise<Array>} Cookies array
   */
  async getCookies(tabId, url = null) {
    try {
      if (!tabId) {
        this.logger.error('Missing tabId when getting cookies');
        return [];
      }

      if (!url) {
        const tab = await this.database.get('SELECT url FROM tabs WHERE id = ?', [tabId]);
        if (!tab || !tab.url) {
          this.logger.warn(`Tab ${tabId} does not exist or has no URL`);
          return [];
        }
        url = tab.url;
      }

      let domain = '';
      try {
        const urlObj = new URL(url);
        domain = urlObj.hostname;
      } catch (err) {
        this.logger.error(`Unable to parse URL: ${url}`, err);
        return [];
      }

      const cookies = await this.database.all(
        `SELECT * FROM cookies 
         WHERE domain = ? 
            OR domain = ? 
            OR (domain LIKE ? AND domain LIKE ?)
         ORDER BY domain, name`,
        [
          domain,
          '.' + domain.split('.').slice(-2).join('.'),
          '%' + domain,
          '%.' + domain.split('.').slice(-1)[0] + '%'
        ]
      );

      this.logger.info(`Found ${cookies.length} related cookies for tab ${tabId} (domain: ${domain})`);

      return cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.http_only),
        sameSite: cookie.same_site,
        expirationDate: cookie.expiration_date,
        session: Boolean(cookie.session),
        storeId: cookie.store_id
      }));
    } catch (err) {
      this.logger.error(`Error getting cookies: ${err.message}`);
      return [];
    }
  }

  /**
   * Get all cookies
   * @param {string} domain Optional domain filter
   * @returns {Promise<Array>} Cookies array
   */
  async getAllCookies(domain = null) {
    try {
      let query = 'SELECT * FROM cookies';
      let params = [];

      if (domain) {
        query += ' WHERE domain = ? OR domain LIKE ? ORDER BY domain, name';
        params = [domain, '%' + domain + '%'];
      } else {
        query += ' ORDER BY domain, name';
      }

      const cookies = await this.database.all(query, params);

      return cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.http_only),
        sameSite: cookie.same_site,
        expirationDate: cookie.expiration_date,
        session: Boolean(cookie.session),
        storeId: cookie.store_id
      }));
    } catch (err) {
      this.logger.error(`Error getting all cookies: ${err.message}`);
      return [];
    }
  }

  /**
   * Delete cookies by domain
   * @param {string} domain Domain
   * @returns {Promise<boolean>} Success/failure
   */
  async deleteCookiesByDomain(domain) {
    try {
      if (!domain) {
        this.logger.error('Missing domain when deleting cookies');
        return false;
      }

      const result = await this.database.run(
        'DELETE FROM cookies WHERE domain = ? OR domain LIKE ?',
        [domain, '%' + domain + '%']
      );

      this.logger.info(`Deleted ${result.changes || 0} cookies for domain ${domain}`);
      return true;
    } catch (err) {
      this.logger.error(`Error deleting cookies: ${err.message}`);
      return false;
    }
  }

  /**
   * Update tabs
   * @param {Array} tabs Tab array
   * @param {string} active_tab_id Active tab ID
   * @returns {Promise<boolean>} Success/failure
   */
  async updateTabs(tabs, active_tab_id) {
    try {
      if (!Array.isArray(tabs)) {
        this.logger.error('Provided tabs is not an array when updating tabs');
        return false;
      }

      this.lastKnownTabCount = tabs.length;
      this.lastKnownActiveTabId = active_tab_id || null;

      await this.database.run('BEGIN TRANSACTION');

      try {
        const currentTabIds = tabs.map(tab => tab.id).filter(id => id);
        const existingTabs = await this.database.all('SELECT id, window_id, index_in_window FROM tabs');
        
        const windowIndexMap = new Map();
        for (const tab of existingTabs) {
          if (!tab.window_id) continue;
          
          const key = tab.window_id.toString();
          if (!windowIndexMap.has(key)) {
            windowIndexMap.set(key, new Set());
          }
          
          windowIndexMap.get(key).add(tab.index_in_window);
        }

        if (active_tab_id) {
          await this.database.run(
            'UPDATE tabs SET is_active = CASE id WHEN ? THEN TRUE ELSE FALSE END',
            [active_tab_id]
          );
        }

        const sortedTabs = [...tabs].sort((a, b) => {
          if (a.window_id !== b.window_id) {
            return (a.window_id || 0) - (b.window_id || 0);
          }
          return (a.index_in_window || 0) - (b.index_in_window || 0);
        });
        
        for (const tab of sortedTabs) {
          if (!tab.window_id) continue;
          
          const key = tab.window_id.toString();
          if (!windowIndexMap.has(key)) {
            windowIndexMap.set(key, new Set());
          }
          
          const indexSet = windowIndexMap.get(key);
          
          while (indexSet.has(tab.index_in_window)) {
            tab.index_in_window++;
          }
          
          indexSet.add(tab.index_in_window);
        }

        for (const tab of sortedTabs) {
          if (!tab.id || !tab.url) {
            continue;
          }

          try {
            await this.database.run(
              `INSERT OR REPLACE INTO tabs (
                id, url, title, is_active, window_id, index_in_window, favicon_url, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                tab.id,
                tab.url,
                tab.title || '',
                tab.is_active ? 1 : 0,  // Convert boolean to integer for SQLite
                tab.window_id || null,
                tab.index_in_window || 0,
                tab.favicon_url || null,
                tab.status || 'complete'
              ]
            );
          } catch (err) {
            if (err.message.includes('UNIQUE constraint failed') && 
                !err.message.includes('UNIQUE constraint failed: tabs.id')) {
              const maxIndexResult = await this.database.get(
                'SELECT MAX(index_in_window) as max_index FROM tabs WHERE window_id = ?',
                [tab.window_id]
              );
              
              const newIndex = (maxIndexResult && maxIndexResult.max_index !== null) 
                ? maxIndexResult.max_index + 1 
                : 0;
              
              await this.database.run(
                `INSERT OR REPLACE INTO tabs (
                  id, url, title, is_active, window_id, index_in_window, favicon_url, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  tab.id,
                  tab.url,
                  tab.title || '',
                  tab.is_active ? 1 : 0,  // Convert boolean to integer for SQLite
                  tab.window_id || null,
                  newIndex,
                  tab.favicon_url || null,
                  tab.status || 'complete'
                ]
              );
            } else {
              throw err;
            }
          }
        }

        if (currentTabIds.length > 0) {
          const placeholders = currentTabIds.map(() => '?').join(',');
          await this.database.run(
            `DELETE FROM tabs WHERE id NOT IN (${placeholders})`,
            currentTabIds
          );
        }

        await this.database.run('COMMIT');
        return true;
      } catch (err) {
        await this.database.run('ROLLBACK');
        this.logger.error(`Error updating tabs: ${err.message}`);
        return false;
      }
    } catch (err) {
      this.logger.error(`Error during tab update: ${err.message}`);
      return false;
    }
  }

  /**
   * Handle HTML chunk
   * @param {Object} data Chunk data
   * @param {string} requestId Request ID
   * @returns {Promise<boolean>} Success/failure
   */
  async handleHtmlChunk(data, requestId) {
    try {
      const { tabId, chunkIndex, chunkData, totalChunks } = data;

      if (!tabId || chunkIndex === undefined || !chunkData || !totalChunks) {
        this.logger.error('Incomplete parameters when handling HTML chunk');
        return false;
      }

      const contentRecord = await this.database.get(
        'SELECT * FROM html_content WHERE tab_id = ?',
        [tabId]
      );

      if (!contentRecord) {
        await this.database.run(
          'INSERT INTO html_content (tab_id, chunk_count, received_chunks) VALUES (?, ?, 1)',
          [tabId, totalChunks]
        );
      } else {
        await this.database.run(
          'UPDATE html_content SET received_chunks = received_chunks + 1 WHERE tab_id = ?',
          [tabId]
        );
      }

      await this.database.run(
        'INSERT OR REPLACE INTO html_chunks (tab_id, chunk_index, chunk_data) VALUES (?, ?, ?)',
        [tabId, chunkIndex, chunkData]
      );

      const updatedContent = await this.database.get(
        'SELECT received_chunks, chunk_count FROM html_content WHERE tab_id = ?',
        [tabId]
      );

      if (updatedContent && updatedContent.received_chunks === updatedContent.chunk_count) {
        await this.mergeHtmlChunks(tabId, requestId);
      }

      return true;
    } catch (err) {
      this.logger.error(`Error handling HTML chunk: ${err.message}`);
      return false;
    }
  }

  /**
   * Merge HTML chunks
   * @param {string} tabId Tab ID
   * @param {string} requestId Request ID
   * @returns {Promise<boolean>} Success/failure
   */
  async mergeHtmlChunks(tabId, requestId) {
    try {
      const chunks = await this.database.all(
        'SELECT chunk_data FROM html_chunks WHERE tab_id = ? ORDER BY chunk_index',
        [tabId]
      );

      if (!chunks || chunks.length === 0) {
        this.logger.error(`HTML chunks not found for tab ${tabId}`);
        return false;
      }

      const fullHtml = chunks.map(chunk => chunk.chunk_data).join('');

      await this.database.run(
        'UPDATE html_content SET full_html = ? WHERE tab_id = ?',
        [fullHtml, tabId]
      );

      this.logger.info(`Successfully merged ${chunks.length} HTML chunks for tab ${tabId}, total length: ${fullHtml.length}`);

      return true;
    } catch (err) {
      this.logger.error(`Error merging HTML chunks: ${err.message}`);
      return false;
    }
  }

  /**
   * Handle tab HTML complete
   * @param {Object} data Data
   * @param {string} requestId Request ID
   * @returns {Promise<boolean>} Success/failure
   */
  async handleTabHtmlComplete(data, requestId) {
    try {
      if (!data.tabId) {
        this.logger.error('Missing tabId when handling tab HTML complete');
        return false;
      }

      let htmlContent = '';
      let isFromChunks = false;

      const contentRecord = await this.database.get(
        'SELECT chunk_count, received_chunks FROM html_content WHERE tab_id = ?',
        [data.tabId]
      );

      if (contentRecord && contentRecord.chunk_count > 1 && 
          contentRecord.received_chunks === contentRecord.chunk_count) {
        const chunks = await this.database.all(
          'SELECT chunk_data FROM html_chunks WHERE tab_id = ? ORDER BY chunk_index',
          [data.tabId]
        );
        
        if (chunks && chunks.length > 0) {
          htmlContent = chunks.map(chunk => chunk.chunk_data).join('');
          isFromChunks = true;
        }
      }

      if (!htmlContent && data.html) {
        htmlContent = data.html;
      }

      if (!htmlContent) {
        const dbContent = await this.database.get(
          'SELECT full_html FROM html_content WHERE tab_id = ?',
          [data.tabId]
        );
        htmlContent = dbContent?.full_html || '';
      }

      if (htmlContent) {
        await this.database.run(
          'INSERT OR REPLACE INTO html_content (tab_id, full_html, chunk_count, received_chunks) VALUES (?, ?, ?, ?)',
          [data.tabId, htmlContent, data.totalChunks || 1, data.totalChunks || 1]
        );

        if (isFromChunks) {
          await this.database.run('DELETE FROM html_chunks WHERE tab_id = ?', [data.tabId]);
        }
      }

      if (this.callbackManager && requestId) {
        await this.callbackManager.postToCallback(requestId, {
          status: 'success',
          type: 'tab_html_complete',
          tabId: data.tabId,
          html: htmlContent,
          full_html: htmlContent,
          htmlLength: htmlContent.length,
          requestId
        });
      }

      return true;
    } catch (err) {
      this.logger.error(`Error handling tab HTML complete: ${err.message}`);
      
      if (this.callbackManager && requestId) {
        await this.callbackManager.postToCallback(requestId, {
          status: 'error',
          type: 'tab_html_complete',
          tabId: data.tabId,
          message: err.message,
          requestId
        });
      }
      
      return false;
    }
  }

  /**
   * Handle close tab complete
   * @param {Object} data Data
   * @param {string} requestId Request ID
   * @returns {Promise<boolean>} Success/failure
   */
  async handleCloseTabComplete(data, requestId) {
    try {
      if (!data.tabId) {
        this.logger.error('Missing tabId when handling close tab complete');
        return false;
      }

      await this.database.run('DELETE FROM tabs WHERE id = ?', [data.tabId]);

      if (this.callbackManager && requestId) {
        await this.callbackManager.postToCallback(requestId, {
          status: 'success',
          type: 'close_tab_complete',
          tabId: data.tabId,
          requestId
        });
      }

      return true;
    } catch (err) {
      this.logger.error(`Error handling close tab complete: ${err.message}`);
      return false;
    }
  }

  /**
   * Handle change tab URL complete
   * @param {Object} data Data
   * @param {string} requestId Request ID
   * @returns {Promise<boolean>} Success/failure
   */
  async handleChangeTabUrlComplete(data, requestId) {
    try {
      if (!data.tabId || !data.newUrl) {
        this.logger.error('Missing required parameters when handling change tab URL complete');
        return false;
      }

      await this.database.run(
        'UPDATE tabs SET url = ? WHERE id = ?',
        [data.newUrl, data.tabId]
      );

      if (this.callbackManager && requestId) {
        await this.callbackManager.postToCallback(requestId, {
          status: 'success',
          type: 'change_tab_url_complete',
          tabId: data.tabId,
          url: data.newUrl,
          requestId
        });
      }

      return true;
    } catch (err) {
      this.logger.error(`Error handling change tab URL complete: ${err.message}`);
      return false;
    }
  }

  /**
   * 获取最近一次同步到内存中的标签页数量
   * @returns {number}
   */
  getLastKnownTabCount() {
    return this.lastKnownTabCount || 0;
  }
}

module.exports = TabsManager;
