const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * LogMeIn Central ETL Pipeline
 * Extracts device, contact, and session data from LogMeIn Central API
 * Transforms and loads into SQLite database
 */
class LogMeInETL extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      apiBaseUrl: config.apiBaseUrl || 'https://api.logmeincentral.com/v1',
      accessToken: config.accessToken || process.env.LOGMEIN_API_TOKEN,
      batchSize: config.batchSize || 100,
      requestTimeout: config.requestTimeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      dbPath: config.dbPath || './logmein_data.db',
      enableCache: config.enableCache !== false,
      cachePath: config.cachePath || './.cache',
    };

    this.client = axios.create({
      baseURL: this.config.apiBaseUrl,
      timeout: this.config.requestTimeout,
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    this.db = null;
    this.stats = {
      extracted: 0,
      transformed: 0,
      loaded: 0,
      errors: [],
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Initialize database and create tables
   */
  async initializeDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.config.dbPath, (err) => {
        if (err) reject(err);
        else {
          this.emit('log', `Database initialized: ${this.config.dbPath}`);
          this.createTables()
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
  }

  /**
   * Create necessary database tables
   */
  async createTables() {
    const tables = [
      `
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          accountId TEXT NOT NULL,
          name TEXT,
          type TEXT,
          platform TEXT,
          lastSeen DATETIME,
          isOnline INTEGER,
          ipAddress TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS contacts (
          id TEXT PRIMARY KEY,
          accountId TEXT NOT NULL,
          name TEXT,
          email TEXT,
          phone TEXT,
          lastModified DATETIME,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          accountId TEXT NOT NULL,
          deviceId TEXT,
          contactId TEXT,
          startTime DATETIME,
          endTime DATETIME,
          duration INTEGER,
          sessionType TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (deviceId) REFERENCES devices(id),
          FOREIGN KEY (contactId) REFERENCES contacts(id)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS etl_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          stage TEXT,
          status TEXT,
          message TEXT,
          recordsProcessed INTEGER
        )
      `,
    ];

    for (const table of tables) {
      await new Promise((resolve, reject) => {
        this.db.run(table, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    this.emit('log', 'Database tables created successfully');
  }

  /**
   * Log ETL event to database
   */
  async logEvent(stage, status, message, recordsProcessed = 0) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO etl_logs (stage, status, message, recordsProcessed) 
         VALUES (?, ?, ?, ?)`,
        [stage, status, message, recordsProcessed],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Extract devices from LogMeIn Central API
   */
  async extractDevices() {
    this.emit('log', 'Starting device extraction...');
    const devices = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.retryRequest(() =>
          this.client.get('/devices', {
            params: {
              limit: this.config.batchSize,
              offset: offset,
            },
          })
        );

        const data = response.data.devices || [];
        devices.push(...data);
        this.stats.extracted += data.length;

        this.emit('log', `Extracted ${data.length} devices (total: ${this.stats.extracted})`);

        hasMore = data.length === this.config.batchSize;
        offset += this.config.batchSize;
      } catch (error) {
        const errorMsg = `Error extracting devices at offset ${offset}: ${error.message}`;
        this.emit('error', errorMsg);
        this.stats.errors.push(errorMsg);
        hasMore = false;
      }
    }

    await this.logEvent('EXTRACT', 'SUCCESS', `Extracted ${devices.length} devices`, devices.length);
    return devices;
  }

  /**
   * Extract contacts from LogMeIn Central API
   */
  async extractContacts() {
    this.emit('log', 'Starting contact extraction...');
    const contacts = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.retryRequest(() =>
          this.client.get('/contacts', {
            params: {
              limit: this.config.batchSize,
              offset: offset,
            },
          })
        );

        const data = response.data.contacts || [];
        contacts.push(...data);
        this.stats.extracted += data.length;

        this.emit('log', `Extracted ${data.length} contacts (total: ${this.stats.extracted})`);

        hasMore = data.length === this.config.batchSize;
        offset += this.config.batchSize;
      } catch (error) {
        const errorMsg = `Error extracting contacts at offset ${offset}: ${error.message}`;
        this.emit('error', errorMsg);
        this.stats.errors.push(errorMsg);
        hasMore = false;
      }
    }

    await this.logEvent('EXTRACT', 'SUCCESS', `Extracted ${contacts.length} contacts`, contacts.length);
    return contacts;
  }

  /**
   * Extract sessions from LogMeIn Central API
   */
  async extractSessions(startDate, endDate) {
    this.emit('log', 'Starting session extraction...');
    const sessions = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.retryRequest(() =>
          this.client.get('/sessions', {
            params: {
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              limit: this.config.batchSize,
              offset: offset,
            },
          })
        );

        const data = response.data.sessions || [];
        sessions.push(...data);
        this.stats.extracted += data.length;

        this.emit('log', `Extracted ${data.length} sessions (total: ${this.stats.extracted})`);

        hasMore = data.length === this.config.batchSize;
        offset += this.config.batchSize;
      } catch (error) {
        const errorMsg = `Error extracting sessions at offset ${offset}: ${error.message}`;
        this.emit('error', errorMsg);
        this.stats.errors.push(errorMsg);
        hasMore = false;
      }
    }

    await this.logEvent('EXTRACT', 'SUCCESS', `Extracted ${sessions.length} sessions`, sessions.length);
    return sessions;
  }

  /**
   * Transform device data
   */
  transformDevices(rawDevices) {
    this.emit('log', 'Transforming device data...');
    return rawDevices.map(device => ({
      id: device.id || device.deviceId,
      accountId: device.accountId || device.accountNumber,
      name: (device.name || device.deviceName || '').trim(),
      type: device.type || 'UNKNOWN',
      platform: device.platform || device.osType || 'UNKNOWN',
      lastSeen: device.lastActivity ? new Date(device.lastActivity) : null,
      isOnline: device.isOnline ? 1 : 0,
      ipAddress: device.ipAddress || device.lastKnownIP || null,
    })).filter(device => device.id); // Filter out devices without ID

    this.stats.transformed += rawDevices.length;
  }

  /**
   * Transform contact data
   */
  transformContacts(rawContacts) {
    this.emit('log', 'Transforming contact data...');
    return rawContacts.map(contact => ({
      id: contact.id || contact.contactId,
      accountId: contact.accountId || contact.accountNumber,
      name: (contact.name || contact.displayName || '').trim(),
      email: (contact.email || '').toLowerCase().trim(),
      phone: contact.phone || contact.phoneNumber || null,
      lastModified: contact.lastModified ? new Date(contact.lastModified) : null,
    })).filter(contact => contact.id); // Filter out contacts without ID

    this.stats.transformed += rawContacts.length;
  }

  /**
   * Transform session data
   */
  transformSessions(rawSessions) {
    this.emit('log', 'Transforming session data...');
    return rawSessions.map(session => {
      const startTime = new Date(session.startTime);
      const endTime = session.endTime ? new Date(session.endTime) : null;
      const duration = endTime ? Math.round((endTime - startTime) / 1000) : null; // Duration in seconds

      return {
        id: session.id || session.sessionId,
        accountId: session.accountId || session.accountNumber,
        deviceId: session.deviceId || session.targetDeviceId,
        contactId: session.contactId || session.initiatorId,
        startTime: startTime,
        endTime: endTime,
        duration: duration,
        sessionType: session.sessionType || 'REMOTE_SUPPORT',
      };
    }).filter(session => session.id); // Filter out sessions without ID

    this.stats.transformed += rawSessions.length;
  }

  /**
   * Load data into database
   */
  async loadDevices(devices) {
    this.emit('log', `Loading ${devices.length} devices into database...`);
    return this.batchInsert('devices', devices);
  }

  /**
   * Load contacts into database
   */
  async loadContacts(contacts) {
    this.emit('log', `Loading ${contacts.length} contacts into database...`);
    return this.batchInsert('contacts', contacts);
  }

  /**
   * Load sessions into database
   */
  async loadSessions(sessions) {
    this.emit('log', `Loading ${sessions.length} sessions into database...`);
    return this.batchInsert('sessions', sessions);
  }

  /**
   * Batch insert records with upsert capability
   */
  async batchInsert(table, records, upsert = true) {
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const placeholders = batch.map(() => '(?)').join(',');
      const columns = Object.keys(batch[0]);
      const values = batch.flatMap(record => [JSON.stringify(record)]);

      const query = upsert
        ? this.buildUpsertQuery(table, columns, batch.length)
        : `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`;

      await new Promise((resolve, reject) => {
        this.db.run(query, values.flat(), function(err) {
          if (err) reject(err);
          else {
            inserted += this.changes;
            resolve();
          }
        });
      });
    }

    this.stats.loaded += inserted;
    this.emit('log', `Loaded ${inserted} records into ${table}`);
    await this.logEvent('LOAD', 'SUCCESS', `Loaded ${inserted} records into ${table}`, inserted);
    return inserted;
  }

  /**
   * Build upsert query for efficient updates
   */
  buildUpsertQuery(table, columns, count) {
    const placeholders = Array(count).fill(`(${columns.map(() => '?').join(',')})`).join(',');
    const updates = columns
      .filter(col => col !== 'id')
      .map(col => `${col}=excluded.${col}`)
      .join(',');

    return `
      INSERT INTO ${table} (${columns.join(',')})
      VALUES ${placeholders}
      ON CONFLICT(id) DO UPDATE SET
      ${updates},
      updatedAt=CURRENT_TIMESTAMP
    `;
  }

  /**
   * Retry mechanism for API calls
   */
  async retryRequest(requestFn, attempt = 1) {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt < this.config.retryAttempts && this.isRetryableError(error)) {
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        this.emit('log', `Retrying request (attempt ${attempt + 1}/${this.config.retryAttempts}) after ${delay}ms`);
        await this.sleep(delay);
        return this.retryRequest(requestFn, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableCodes = [408, 429, 500, 502, 503, 504];
    return retryableCodes.includes(error.response?.status);
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main ETL pipeline execution
   */
  async run(options = {}) {
    const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    const endDate = options.endDate || new Date();

    this.stats.startTime = new Date();

    try {
      await this.initializeDatabase();

      // Extract phase
      const devices = await this.extractDevices();
      const contacts = await this.extractContacts();
      const sessions = await this.extractSessions(startDate, endDate);

      // Transform phase
      const transformedDevices = this.transformDevices(devices);
      const transformedContacts = this.transformContacts(contacts);
      const transformedSessions = this.transformSessions(sessions);

      // Load phase
      await this.loadDevices(transformedDevices);
      await this.loadContacts(transformedContacts);
      await this.loadSessions(transformedSessions);

      this.stats.endTime = new Date();

      const duration = (this.stats.endTime - this.stats.startTime) / 1000;
      this.emit('log', `ETL completed successfully in ${duration}s`);
      this.emit('complete', this.getStats());

      return this.getStats();
    } catch (error) {
      this.stats.endTime = new Date();
      const errorMsg = `ETL pipeline failed: ${error.message}`;
      this.emit('error', errorMsg);
      this.stats.errors.push(errorMsg);
      throw error;
    } finally {
      this.close();
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) this.emit('error', `Error closing database: ${err.message}`);
        else this.emit('log', 'Database connection closed');
      });
    }
  }

  /**
   * Get ETL statistics
   */
  getStats() {
    return {
      ...this.stats,
      duration: this.stats.endTime 
        ? Math.round((this.stats.endTime - this.stats.startTime) / 1000) 
        : null,
      successRate: this.stats.extracted > 0 
        ? ((this.stats.loaded / this.stats.extracted) * 100).toFixed(2) + '%'
        : '0%',
    };
  }

  /**
   * Query extracted data
   */
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

module.exports = LogMeInETL;
