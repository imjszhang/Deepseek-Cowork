/**
 * Database module for browser control service
 * Using sql.js for cross-platform SQLite operations (no native compilation required)
 */

const initSqlJs = require('sql.js');
const Logger = require('./logger');
const fs = require('fs');
const path = require('path');

class Database {
  constructor(dbName = 'browser_data.db') {
    this.dbName = dbName;
    this.db = null;
    this.SQL = null;
    this.checkpointInterval = null;
    this.saveInterval = null;
    this.isDirty = false; // Track if database has unsaved changes
  }

  /**
   * Initialize database connection
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      // Initialize sql.js
      this.SQL = await initSqlJs();
      
      // Try to load existing database file
      if (fs.existsSync(this.dbName)) {
        try {
          const fileBuffer = fs.readFileSync(this.dbName);
          this.db = new this.SQL.Database(fileBuffer);
          Logger.info(`Loaded existing database: ${this.dbName}`);
        } catch (loadErr) {
          Logger.warn(`Failed to load existing database, creating new one: ${loadErr.message}`);
          this.db = new this.SQL.Database();
        }
      } else {
        this.db = new this.SQL.Database();
        Logger.info(`Created new database: ${this.dbName}`);
      }
      
      await this.configureDatabase();
    } catch (err) {
      Logger.error(`Database connection error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Configure database performance parameters
   * @returns {Promise<void>}
   */
  async configureDatabase() {
    try {
      // Enable foreign key constraints
      this.db.run('PRAGMA foreign_keys = ON');
      
      // Set cache size
      this.db.run('PRAGMA cache_size = -20000');
      
      // Set temp storage to memory
      this.db.run('PRAGMA temp_store = MEMORY');

      Logger.info('Database performance configuration complete');
      
      // Start periodic save (every 30 seconds)
      this.startPeriodicSave();
    } catch (err) {
      Logger.error(`Database configuration error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Start periodic database save to file
   * @param {number} intervalSeconds Save interval (seconds)
   */
  startPeriodicSave(intervalSeconds = 30) {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    
    this.saveInterval = setInterval(() => {
      if (this.isDirty) {
        try {
          this.saveToFile();
          Logger.debug('Periodic database save completed');
        } catch (err) {
          Logger.error(`Periodic database save error: ${err.message}`);
        }
      }
    }, intervalSeconds * 1000);
    
    Logger.info(`Started periodic database save, interval: ${intervalSeconds} seconds`);
  }

  /**
   * Stop periodic database save
   */
  stopPeriodicSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
      Logger.info('Stopped periodic database save');
    }
  }

  /**
   * Save database to file
   */
  saveToFile() {
    if (!this.db) return;
    
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      
      // Ensure directory exists
      const dir = path.dirname(this.dbName);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.dbName, buffer);
      this.isDirty = false;
      Logger.debug(`Database saved to: ${this.dbName}`);
    } catch (err) {
      Logger.error(`Failed to save database: ${err.message}`);
      throw err;
    }
  }

  /**
   * Initialize database table structure
   * @returns {Promise<void>}
   */
  async initDb() {
    if (!this.db) {
      await this.connect();
    }

    const queries = [
      // Create tabs table
      `CREATE TABLE IF NOT EXISTS tabs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT DEFAULT '',
        is_active BOOLEAN DEFAULT FALSE,
        window_id TEXT,
        index_in_window INTEGER,
        favicon_url TEXT,
        status TEXT DEFAULT 'complete',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_status CHECK (status IN ('loading', 'complete', 'error')),
        CONSTRAINT valid_url CHECK (url != ''),
        CONSTRAINT unique_window_index UNIQUE (window_id, index_in_window)
      )`,

      // Create independent cookies table (not associated with tab_id)
      `CREATE TABLE IF NOT EXISTS cookies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value TEXT,
        domain TEXT NOT NULL,
        path TEXT DEFAULT '/',
        secure BOOLEAN DEFAULT FALSE,
        http_only BOOLEAN DEFAULT FALSE,
        same_site TEXT DEFAULT 'no_restriction',
        expiration_date INTEGER,
        session BOOLEAN DEFAULT FALSE,
        store_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_same_site CHECK (same_site IN ('strict', 'lax', 'none', 'no_restriction', 'unspecified')),
        CONSTRAINT unique_cookie UNIQUE (name, domain, path)
      )`,

      // Create HTML content table
      `CREATE TABLE IF NOT EXISTS html_content (
        tab_id TEXT PRIMARY KEY,
        full_html TEXT,
        chunk_count INTEGER,
        received_chunks INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tab_id) REFERENCES tabs (id) ON DELETE CASCADE
      )`,

      // Create HTML chunks table
      `CREATE TABLE IF NOT EXISTS html_chunks (
        tab_id TEXT,
        chunk_index INTEGER,
        chunk_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tab_id, chunk_index),
        FOREIGN KEY (tab_id) REFERENCES html_content (tab_id) ON DELETE CASCADE
      )`,

      // Create callbacks table
      `CREATE TABLE IF NOT EXISTS callbacks (
        request_id TEXT PRIMARY KEY,
        callback_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (DATETIME(CURRENT_TIMESTAMP, '+1 hour'))
      )`,

      // Create callback responses table
      `CREATE TABLE IF NOT EXISTS callback_responses (
        request_id TEXT PRIMARY KEY,
        response_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Create WebSocket clients table
      `CREATE TABLE IF NOT EXISTS websocket_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT UNIQUE NOT NULL,
        address TEXT NOT NULL,
        client_type TEXT DEFAULT 'extension',
        connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        disconnected_at TIMESTAMP
      )`,

      // Create audit logs table (for security audit trail)
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        event_type TEXT NOT NULL,
        session_id TEXT,
        client_id TEXT,
        client_type TEXT,
        client_address TEXT,
        action TEXT,
        target_tab_id INTEGER,
        target_url TEXT,
        status TEXT,
        duration INTEGER,
        request_id TEXT,
        details TEXT
      )`,

      // Create indexes to improve query performance
      `CREATE INDEX IF NOT EXISTS idx_tabs_window ON tabs(window_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tabs_active ON tabs(is_active)`,
      `CREATE INDEX IF NOT EXISTS idx_callbacks_expires ON callbacks(expires_at)`,
      `CREATE INDEX IF NOT EXISTS idx_cookies_domain ON cookies(domain)`,
      `CREATE INDEX IF NOT EXISTS idx_cookies_name ON cookies(name)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_logs(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type)`
    ];

    // Triggers for sql.js
    const triggerQueries = [
      // Create trigger to auto-update html_content updated_at
      `CREATE TRIGGER IF NOT EXISTS update_html_content_timestamp 
       AFTER UPDATE ON html_content
       BEGIN
         UPDATE html_content SET updated_at = CURRENT_TIMESTAMP 
         WHERE tab_id = NEW.tab_id;
       END`,

      // Create trigger to auto-update tabs updated_at
      `CREATE TRIGGER IF NOT EXISTS update_tabs_timestamp 
       AFTER UPDATE ON tabs
       BEGIN
         UPDATE tabs SET updated_at = CURRENT_TIMESTAMP 
         WHERE id = NEW.id;
       END`,

      // Create trigger to auto-update cookies updated_at
      `CREATE TRIGGER IF NOT EXISTS update_cookies_timestamp 
       AFTER UPDATE ON cookies
       BEGIN
         UPDATE cookies SET updated_at = CURRENT_TIMESTAMP 
         WHERE id = NEW.id;
       END`
    ];

    try {
      // Execute table creation queries
      for (const query of queries) {
        try {
          this.db.run(query);
        } catch (err) {
          // Ignore "already exists" errors
          if (!err.message.includes('already exists')) {
            Logger.warn(`Table creation warning: ${err.message}`);
          }
        }
      }
      
      // Create triggers
      for (const trigger of triggerQueries) {
        try {
          this.db.run(trigger);
        } catch (err) {
          // Ignore "trigger already exists" errors
          if (!err.message.includes('already exists')) {
            Logger.warn(`Trigger creation warning: ${err.message}`);
          }
        }
      }
      
      this.isDirty = true;
      this.saveToFile();
      
      Logger.info('Database initialized successfully');
      
      // Check and create potentially missing tables (for backward compatibility)
      await this.checkAndCreateMissingTables();
    } catch (err) {
      Logger.error(`Database initialization error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Execute single SQL query
   * @param {string} query SQL query statement
   * @param {Array} params Query parameters
   * @returns {Promise<Object>} Query result
   */
  async run(query, params = []) {
    try {
      // Handle transaction control statements
      const upperQuery = query.trim().toUpperCase();
      if (upperQuery === 'BEGIN TRANSACTION' || 
          upperQuery === 'BEGIN' ||
          upperQuery === 'COMMIT' || 
          upperQuery === 'ROLLBACK') {
        this.db.run(query);
        return { lastID: null, changes: 0 };
      }
      
      this.db.run(query, params);
      this.isDirty = true;
      
      // Get last insert rowid and changes
      const lastIDResult = this.db.exec('SELECT last_insert_rowid() as lastID');
      const changesResult = this.db.exec('SELECT changes() as changes');
      
      const lastID = lastIDResult.length > 0 && lastIDResult[0].values.length > 0 
        ? String(lastIDResult[0].values[0][0]) 
        : null;
      const changes = changesResult.length > 0 && changesResult[0].values.length > 0 
        ? changesResult[0].values[0][0] 
        : 0;
      
      return { lastID, changes };
    } catch (err) {
      Logger.error(`Database execute error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Execute query and get single row result
   * @param {string} query SQL query statement
   * @param {Array} params Query parameters
   * @returns {Promise<Object>} Query result
   */
  async get(query, params = []) {
    try {
      const stmt = this.db.prepare(query);
      stmt.bind(params);
      
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      
      stmt.free();
      return undefined;
    } catch (err) {
      Logger.error(`Database get error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Execute query and get all rows
   * @param {string} query SQL query statement
   * @param {Array} params Query parameters
   * @returns {Promise<Array>} Query result
   */
  async all(query, params = []) {
    try {
      const stmt = this.db.prepare(query);
      stmt.bind(params);
      
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      
      stmt.free();
      return results;
    } catch (err) {
      Logger.error(`Database query error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Execute transaction
   * @param {Array<string>} queries Array of queries to execute
   * @param {Array<Array>} paramsArray Array of parameter arrays (optional)
   * @returns {Promise<void>}
   */
  async runTransaction(queries, paramsArray = []) {
    if (!queries || queries.length === 0) {
      return;
    }

    try {
      this.db.run('BEGIN TRANSACTION');
      
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        const params = paramsArray[i] || [];
        
        try {
          this.db.run(query, params);
          Logger.debug(`Query ${i + 1}/${queries.length} executed successfully`);
        } catch (err) {
          Logger.error(`Query ${i + 1}/${queries.length} execution error: ${err.message}`, { query, params });
          throw err;
        }
      }
      
      this.db.run('COMMIT');
      this.isDirty = true;
      Logger.debug(`Transaction completed successfully, executed ${queries.length} queries`);
    } catch (err) {
      try {
        this.db.run('ROLLBACK');
      } catch (rollbackErr) {
        Logger.error(`Rollback error: ${rollbackErr.message}`);
      }
      Logger.error(`Transaction failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Placeholder for WAL checkpoint (not applicable to sql.js, saves to file instead)
   * @param {string} mode Checkpoint mode (ignored)
   * @returns {Promise<void>}
   */
  async checkpoint(mode = 'PASSIVE') {
    try {
      // sql.js doesn't support WAL mode, just save to file
      this.saveToFile();
      Logger.info(`Database saved (checkpoint ${mode} mode emulated)`);
    } catch (err) {
      Logger.error(`Database save error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get database info (for compatibility)
   * @returns {Promise<Object>} Database info
   */
  async getWalInfo() {
    return {
      journalMode: 'memory', // sql.js is in-memory
      walInfo: null
    };
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db) {
      try {
        // Stop periodic save
        this.stopPeriodicSave();
        
        // Save before closing
        try {
          this.saveToFile();
          Logger.info('Final database save completed');
        } catch (err) {
          Logger.warn(`Final database save warning: ${err.message}`);
        }
        
        // Close database
        this.db.close();
        Logger.info('Database connection closed');
        this.db = null;
        this.SQL = null;
      } catch (err) {
        Logger.error(`Close database error: ${err.message}`);
        throw err;
      }
    }
  }

  /**
   * Check and create missing tables (for database upgrade)
   * @returns {Promise<void>}
   */
  async checkAndCreateMissingTables() {
    try {
      // Check if cookies table exists
      const cookiesExists = await this.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='cookies'"
      );

      if (!cookiesExists) {
        Logger.info('Missing cookies table detected, creating...');
        
        const createCookiesQueries = [
          // Create independent cookies table
          `CREATE TABLE IF NOT EXISTS cookies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            value TEXT,
            domain TEXT NOT NULL,
            path TEXT DEFAULT '/',
            secure BOOLEAN DEFAULT FALSE,
            http_only BOOLEAN DEFAULT FALSE,
            same_site TEXT DEFAULT 'no_restriction',
            expiration_date INTEGER,
            session BOOLEAN DEFAULT FALSE,
            store_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT valid_same_site CHECK (same_site IN ('strict', 'lax', 'none', 'no_restriction', 'unspecified')),
            CONSTRAINT unique_cookie UNIQUE (name, domain, path)
          )`,

          // Create indexes
          `CREATE INDEX IF NOT EXISTS idx_cookies_domain ON cookies(domain)`,
          `CREATE INDEX IF NOT EXISTS idx_cookies_name ON cookies(name)`
        ];

        await this.runTransaction(createCookiesQueries);
        
        // Create trigger separately
        try {
          this.db.run(`CREATE TRIGGER IF NOT EXISTS update_cookies_timestamp 
           AFTER UPDATE ON cookies
           BEGIN
             UPDATE cookies SET updated_at = CURRENT_TIMESTAMP 
             WHERE id = NEW.id;
           END`);
        } catch (err) {
          if (!err.message.includes('already exists')) {
            Logger.warn(`Trigger creation warning: ${err.message}`);
          }
        }
        
        Logger.info('Cookies table and related indexes/triggers created successfully');
      }

      // Handle data migration from tab_cookies to cookies
      await this.migrateCookiesTable();

      // Check if websocket_clients table has client_type column
      const tableInfoResult = this.db.exec("PRAGMA table_info('websocket_clients')");
      let clientTypeColumnExists = false;
      
      if (tableInfoResult.length > 0 && tableInfoResult[0].values) {
        clientTypeColumnExists = tableInfoResult[0].values.some(row => row[1] === 'client_type');
      }

      if (!clientTypeColumnExists) {
        Logger.info('Detected websocket_clients table missing client_type column, adding...');
        try {
          this.db.run(`ALTER TABLE websocket_clients ADD COLUMN client_type TEXT DEFAULT 'extension'`);
          this.isDirty = true;
          Logger.info('client_type column added to websocket_clients table successfully');
        } catch (err) {
          // Column might already exist
          if (!err.message.includes('duplicate column')) {
            Logger.warn(`Add column warning: ${err.message}`);
          }
        }
      }

      Logger.info('Database table check completed');
    } catch (err) {
      Logger.error(`Error checking/creating missing tables: ${err.message}`);
      throw err;
    }
  }

  /**
   * Migrate cookies table structure (from tab_cookies to cookies)
   * @returns {Promise<void>}
   */
  async migrateCookiesTable() {
    try {
      // Check if old tab_cookies table exists
      const tabCookiesExists = await this.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tab_cookies'"
      );

      if (tabCookiesExists) {
        Logger.info('Detected old tab_cookies table, starting data migration to cookies table...');
        
        // Check if cookies table exists
        const cookiesExists = await this.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='cookies'"
        );

        if (cookiesExists) {
          // Migrate data (remove tab_id field, keep other fields)
          const migrationQuery = `
            INSERT OR IGNORE INTO cookies (
              name, value, domain, path, secure, http_only, same_site, 
              expiration_date, session, store_id, created_at, updated_at
            )
            SELECT DISTINCT 
              name, value, domain, path, secure, http_only, same_site, 
              expiration_date, session, store_id, created_at, updated_at
            FROM tab_cookies
          `;
          
          await this.run(migrationQuery);
          
          Logger.info(`Cookie records migration completed`);
          
          // Delete old table
          this.db.run('DROP TABLE tab_cookies');
          this.isDirty = true;
          Logger.info('Old tab_cookies table deleted');
        }
      }
    } catch (err) {
      Logger.error(`Cookies table migration failed: ${err.message}`);
      // Don't throw error as this is not a fatal issue
    }
  }
}

module.exports = Database;
