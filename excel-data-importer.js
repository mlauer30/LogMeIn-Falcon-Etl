/**
 * Excel Data Importer
 * Loads raw inventory data from Excel files into SQLite database
 * Useful for testing ETL pipeline without API access
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');

class ExcelDataImporter {
  constructor(dbPath = './logmein_data.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Initialize database
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) reject(err);
        else {
          console.log(`Database initialized: ${this.dbPath}`);
          this.createTables()
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
  }

  /**
   * Create tables matching LogMeIn schema
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
    console.log('Database tables created successfully');
  }

  /**
   * Import devices from raw data
   * Expected format:
   * {
   *   id, name, platform, type, isOnline, ipAddress, lastSeen, accountId
   * }
   */
  async importDevices(deviceData) {
    console.log(`Importing ${deviceData.length} devices...`);
    
    // Validate and clean data
    const validDevices = deviceData
      .filter(d => d.id && d.name)
      .map(d => ({
        id: String(d.id).trim(),
        accountId: String(d.accountId || d.account || 'DEFAULT').trim(),
        name: String(d.name).trim(),
        type: String(d.type || 'UNKNOWN').trim(),
        platform: String(d.platform || 'UNKNOWN').trim(),
        lastSeen: d.lastSeen ? new Date(d.lastSeen) : null,
        isOnline: d.isOnline === true || d.isOnline === 1 || String(d.isOnline).toLowerCase() === 'true' ? 1 : 0,
        ipAddress: d.ipAddress ? String(d.ipAddress).trim() : null,
      }));

    return this.batchInsert('devices', validDevices);
  }

  /**
   * Import contacts from raw data
   * Expected format:
   * {
   *   id, name, email, phone, accountId, lastModified
   * }
   */
  async importContacts(contactData) {
    console.log(`Importing ${contactData.length} contacts...`);

    const validContacts = contactData
      .filter(c => c.id && c.name)
      .map(c => ({
        id: String(c.id).trim(),
        accountId: String(c.accountId || c.account || 'DEFAULT').trim(),
        name: String(c.name).trim(),
        email: c.email ? String(c.email).toLowerCase().trim() : null,
        phone: c.phone ? String(c.phone).trim() : null,
        lastModified: c.lastModified ? new Date(c.lastModified) : null,
      }));

    return this.batchInsert('contacts', validContacts);
  }

  /**
   * Import sessions from raw data
   * Expected format:
   * {
   *   id, deviceId, contactId, startTime, endTime, accountId
   * }
   */
  async importSessions(sessionData) {
    console.log(`Importing ${sessionData.length} sessions...`);

    const validSessions = sessionData
      .filter(s => s.id && s.startTime)
      .map(s => {
        const startTime = new Date(s.startTime);
        const endTime = s.endTime ? new Date(s.endTime) : null;
        const duration = endTime ? Math.round((endTime - startTime) / 1000) : null;

        return {
          id: String(s.id).trim(),
          accountId: String(s.accountId || s.account || 'DEFAULT').trim(),
          deviceId: s.deviceId ? String(s.deviceId).trim() : null,
          contactId: s.contactId ? String(s.contactId).trim() : null,
          startTime: startTime,
          endTime: endTime,
          duration: duration,
          sessionType: String(s.sessionType || 'REMOTE_SUPPORT').trim(),
        };
      });

    return this.batchInsert('sessions', validSessions);
  }

  /**
   * Batch insert records with upsert
   */
  async batchInsert(table, records) {
    if (records.length === 0) {
      console.log(`No valid records to insert into ${table}`);
      return 0;
    }

    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const columns = Object.keys(batch[0]);
      const values = batch.flatMap(record => columns.map(col => record[col]));

      const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
      const updates = columns
        .filter(col => col !== 'id')
        .map(col => `${col}=excluded.${col}`)
        .join(',');

      /* const query = `
        INSERT INTO ${table} (${columns.join(',')})
        VALUES ${placeholders}
        ON CONFLICT(id) DO UPDATE SET
        ${updates},
        updatedAt=CURRENT_TIMESTAMP
      `; */

      await new Promise((resolve, reject) => {
        this.db.run(/*query,*/ values, function(err) {
          if (err) reject(err);
          else {
            inserted += this.changes;
            resolve();
          }
        });
      });
    }

    console.log(`✅ Inserted ${inserted} records into ${table}`);
    return inserted;
  }

  /**
   * Import from CSV file
   */
  async importFromCSV(csvPath, table) {
    console.log(`\nImporting from CSV: ${csvPath}`);
    
    const csv = require('csv-parse/sync');
    
    try {
      const content = await fs.readFile(csvPath, 'utf-8');
      const records = csv.parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      console.log(`Parsed ${records.length} records from CSV`);

      switch (table.toLowerCase()) {
        case 'devices':
          return await this.importDevices(records);
        case 'contacts':
          return await this.importContacts(records);
        case 'sessions':
          return await this.importSessions(records);
        default:
          throw new Error(`Unknown table: ${table}`);
      }
    } catch (error) {
      console.error(`Error importing from CSV: ${error.message}`);
      throw error;
    }
  }

  /**
   * Import from JSON file
   */
  async importFromJSON(jsonPath, table) {
    console.log(`\nImporting from JSON: ${jsonPath}`);
    
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      const records = JSON.parse(content);

      if (!Array.isArray(records)) {
        throw new Error('JSON must contain an array of objects');
      }

      console.log(`Parsed ${records.length} records from JSON`);

      switch (table.toLowerCase()) {
        case 'devices':
          return await this.importDevices(records);
        case 'contacts':
          return await this.importContacts(records);
        case 'sessions':
          return await this.importSessions(records);
        default:
          throw new Error(`Unknown table: ${table}`);
      }
    } catch (error) {
      console.error(`Error importing from JSON: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate sample data for testing
   */
  async generateSampleData() {
    console.log('\n📊 Generating sample data for testing...\n');

    // Sample devices
    const sampleDevices = [
      {
        id: 'DEV-001',
        accountId: 'ACCT-001',
        name: 'DESKTOP-ALICE',
        platform: 'Windows',
        type: 'Workstation',
        isOnline: 1,
        ipAddress: '192.168.1.10',
        lastSeen: new Date(),
      },
      {
        id: 'DEV-002',
        accountId: 'ACCT-001',
        name: 'DESKTOP-BOB',
        platform: 'macOS',
        type: 'Workstation',
        isOnline: 1,
        ipAddress: '192.168.1.11',
        lastSeen: new Date(),
      },
      {
        id: 'DEV-003',
        accountId: 'ACCT-001',
        name: 'LAPTOP-CHARLIE',
        platform: 'Windows',
        type: 'Laptop',
        isOnline: 0,
        ipAddress: '192.168.1.12',
        lastSeen: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      },
      {
        id: 'DEV-004',
        accountId: 'ACCT-001',
        name: 'LAPTOP-DIANA',
        platform: 'Windows',
        type: 'Laptop',
        isOnline: 1,
        ipAddress: '192.168.1.13',
        lastSeen: new Date(),
      },
      {
        id: 'DEV-005',
        accountId: 'ACCT-002',
        name: 'DESKTOP-EVE',
        platform: 'Linux',
        type: 'Server',
        isOnline: 1,
        ipAddress: '192.168.1.20',
        lastSeen: new Date(),
      },
    ];

    // Sample contacts
    const sampleContacts = [
      {
        id: 'CONT-001',
        accountId: 'ACCT-001',
        name: 'Alice Johnson',
        email: 'alice.johnson@example.com',
        phone: '555-0101',
        lastModified: new Date(),
      },
      {
        id: 'CONT-002',
        accountId: 'ACCT-001',
        name: 'Bob Smith',
        email: 'bob.smith@example.com',
        phone: '555-0102',
        lastModified: new Date(),
      },
      {
        id: 'CONT-003',
        accountId: 'ACCT-001',
        name: 'Charlie Brown',
        email: 'charlie.brown@example.com',
        phone: '555-0103',
        lastModified: new Date(),
      },
      {
        id: 'CONT-004',
        accountId: 'ACCT-002',
        name: 'Diana Prince',
        email: 'diana.prince@example.com',
        phone: '555-0104',
        lastModified: new Date(),
      },
    ];

    // Sample sessions
    const sampleSessions = [
      {
        id: 'SESSION-001',
        accountId: 'ACCT-001',
        deviceId: 'DEV-001',
        contactId: 'CONT-001',
        startTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        endTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        sessionType: 'REMOTE_SUPPORT',
      },
      {
        id: 'SESSION-002',
        accountId: 'ACCT-001',
        deviceId: 'DEV-002',
        contactId: 'CONT-002',
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 60 * 60 * 1000),
        sessionType: 'REMOTE_ACCESS',
      },
      {
        id: 'SESSION-003',
        accountId: 'ACCT-001',
        deviceId: 'DEV-004',
        contactId: 'CONT-003',
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        endTime: new Date(Date.now() - 23 * 60 * 60 * 1000),
        sessionType: 'REMOTE_SUPPORT',
      },
    ];

    console.log(`Importing ${sampleDevices.length} sample devices...`);
    await this.importDevices(sampleDevices);

    console.log(`Importing ${sampleContacts.length} sample contacts...`);
    await this.importContacts(sampleContacts);

    console.log(`Importing ${sampleSessions.length} sample sessions...`);
    await this.importSessions(sampleSessions);

    console.log('\n✅ Sample data imported successfully!');
    console.log('\nYou can now:');
    console.log('  npm run example:analyze    - Analyze the data');
    console.log('  npm run example:csv        - Export to CSV');
    console.log('  sqlite3 logmein_data.db    - Query directly');
  }

  /**
   * Get import statistics
   */
  async getStatistics() {
    const stats = {
      devices: await this.query('SELECT COUNT(*) as count FROM devices'),
      contacts: await this.query('SELECT COUNT(*) as count FROM contacts'),
      sessions: await this.query('SELECT COUNT(*) as count FROM sessions'),
      etlLogs: await this.query('SELECT COUNT(*) as count FROM etl_logs'),
    };

    return {
      totalDevices: stats.devices[0].count,
      totalContacts: stats.contacts[0].count,
      totalSessions: stats.sessions[0].count,
      totalLogs: stats.etlLogs[0].count,
    };
  }

  /**
   * Query helper
   */
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) console.error(`Error closing database: ${err.message}`);
        else console.log('Database connection closed');
      });
    }
  }

  /**
   * Create template CSV files for user to fill in
   */
  async createTemplates() {
    console.log('\n📋 Creating CSV templates...\n');

    const csv = require('csv-stringify/sync');

    // Device template
    const deviceTemplate = [
      {
        id: 'DEV-001',
        accountId: 'ACCT-001',
        name: 'DESKTOP-USER1',
        platform: 'Windows',
        type: 'Workstation',
        isOnline: 1,
        ipAddress: '192.168.1.10',
        lastSeen: new Date().toISOString(),
      },
    ];

    // Contact template
    const contactTemplate = [
      {
        id: 'CONT-001',
        accountId: 'ACCT-001',
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '555-0001',
        lastModified: new Date().toISOString(),
      },
    ];

    // Session template
    const sessionTemplate = [
      {
        id: 'SESSION-001',
        accountId: 'ACCT-001',
        deviceId: 'DEV-001',
        contactId: 'CONT-001',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        sessionType: 'REMOTE_SUPPORT',
      },
    ];

    await fs.mkdir('templates', { recursive: true });

    await fs.writeFile(
      'templates/devices_template.csv',
      csv.stringify(deviceTemplate, { header: true })
    );
    await fs.writeFile(
      'templates/contacts_template.csv',
      csv.stringify(contactTemplate, { header: true })
    );
    await fs.writeFile(
      'templates/sessions_template.csv',
      csv.stringify(sessionTemplate, { header: true })
    );

    console.log('✅ Templates created in templates/ folder:');
    console.log('  - devices_template.csv');
    console.log('  - contacts_template.csv');
    console.log('  - sessions_template.csv');
    console.log('\n📝 Instructions:');
    console.log('  1. Copy template to your data');
    console.log('  2. Fill in your actual inventory data');
    console.log('  3. Save as CSV');
    console.log('  4. Run: node import-data.js --import devices templates/devices.csv');
  }
}

module.exports = ExcelDataImporter;
