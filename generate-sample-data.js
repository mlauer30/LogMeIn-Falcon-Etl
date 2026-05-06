#!/usr/bin/env node

/**
 * Simple Sample Data Generator
 * Creates test data directly in SQLite without using the importer class
 */

const sqlite3 = require('sqlite3').verbose();

// Open database
const db = new sqlite3.Database('./logmein_data.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Database opened');
});

// Create tables
const createTables = () => {
  console.log('Creating tables...');
  
  db.serialize(() => {
    // Devices table
    db.run(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        name TEXT,
        type TEXT,
        platform TEXT,
        lastSeen DATETIME,
        isOnline INTEGER,
        ipAddress TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating devices table:', err);
      else console.log('✓ devices table created');
    });

    // Contacts table
    db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        name TEXT,
        email TEXT,
        phone TEXT,
        lastModified DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating contacts table:', err);
      else console.log('✓ contacts table created');
    });

    // Sessions table
    db.run(`
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
    `, (err) => {
      if (err) console.error('Error creating sessions table:', err);
      else console.log('✓ sessions table created');
    });

    // ETL logs table
    db.run(`
      CREATE TABLE IF NOT EXISTS etl_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        stage TEXT,
        status TEXT,
        message TEXT,
        recordsProcessed INTEGER
      )
    `, (err) => {
      if (err) console.error('Error creating etl_logs table:', err);
      else console.log('✓ etl_logs table created');
    });
  });
};

// Insert sample devices
const insertDevices = () => {
  console.log('\nInserting sample devices...');

  const devices = [
    ['DEV-001', 'ACCT-001', 'DESKTOP-ALICE', 'Workstation', 'Windows', new Date().toISOString(), 1, '192.168.1.10'],
    ['DEV-002', 'ACCT-001', 'DESKTOP-BOB', 'Workstation', 'macOS', new Date().toISOString(), 1, '192.168.1.11'],
    ['DEV-003', 'ACCT-001', 'LAPTOP-CHARLIE', 'Laptop', 'Windows', new Date(Date.now() - 2*24*60*60*1000).toISOString(), 0, '192.168.1.12'],
    ['DEV-004', 'ACCT-001', 'LAPTOP-DIANA', 'Laptop', 'Windows', new Date().toISOString(), 1, '192.168.1.13'],
    ['DEV-005', 'ACCT-002', 'DESKTOP-EVE', 'Server', 'Linux', new Date().toISOString(), 1, '192.168.1.20'],
  ];

  db.serialize(() => {
    const stmt = db.prepare(`
      INSERT INTO devices (id, accountId, name, type, platform, lastSeen, isOnline, ipAddress)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    devices.forEach(device => {
      stmt.run(device, (err) => {
        if (err) console.error('Insert error:', err);
      });
    });

    stmt.finalize((err) => {
      if (err) console.error('Finalize error:', err);
      else console.log(`✓ Inserted ${devices.length} devices`);
    });
  });
};

// Insert sample contacts
const insertContacts = () => {
  console.log('Inserting sample contacts...');

  const contacts = [
    ['CONT-001', 'ACCT-001', 'Alice Johnson', 'alice.johnson@example.com', '555-0101', new Date().toISOString()],
    ['CONT-002', 'ACCT-001', 'Bob Smith', 'bob.smith@example.com', '555-0102', new Date().toISOString()],
    ['CONT-003', 'ACCT-001', 'Charlie Brown', 'charlie.brown@example.com', '555-0103', new Date().toISOString()],
    ['CONT-004', 'ACCT-002', 'Diana Prince', 'diana.prince@example.com', '555-0104', new Date().toISOString()],
  ];

  db.serialize(() => {
    const stmt = db.prepare(`
      INSERT INTO contacts (id, accountId, name, email, phone, lastModified)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    contacts.forEach(contact => {
      stmt.run(contact, (err) => {
        if (err) console.error('Insert error:', err);
      });
    });

    stmt.finalize((err) => {
      if (err) console.error('Finalize error:', err);
      else console.log(`✓ Inserted ${contacts.length} contacts`);
    });
  });
};

// Insert sample sessions
const insertSessions = () => {
  console.log('Inserting sample sessions...');

  const sessions = [
    ['SESSION-001', 'ACCT-001', 'DEV-001', 'CONT-001', new Date(Date.now() - 60*60*1000).toISOString(), new Date(Date.now() - 30*60*1000).toISOString(), 1800, 'REMOTE_SUPPORT'],
    ['SESSION-002', 'ACCT-001', 'DEV-002', 'CONT-002', new Date(Date.now() - 2*60*60*1000).toISOString(), new Date(Date.now() - 60*60*1000).toISOString(), 3600, 'REMOTE_ACCESS'],
    ['SESSION-003', 'ACCT-001', 'DEV-004', 'CONT-003', new Date(Date.now() - 24*60*60*1000).toISOString(), new Date(Date.now() - 23.75*60*60*1000).toISOString(), 900, 'REMOTE_SUPPORT'],
  ];

  db.serialize(() => {
    const stmt = db.prepare(`
      INSERT INTO sessions (id, accountId, deviceId, contactId, startTime, endTime, duration, sessionType)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sessions.forEach(session => {
      stmt.run(session, (err) => {
        if (err) console.error('Insert error:', err);
      });
    });

    stmt.finalize((err) => {
      if (err) console.error('Finalize error:', err);
      else console.log(`✓ Inserted ${sessions.length} sessions`);
    });
  });
};

// Verify data was inserted
const verifyData = () => {
  console.log('\nVerifying data...');
  
  db.serialize(() => {
    db.all('SELECT COUNT(*) as count FROM devices', (err, rows) => {
      if (err) console.error('Error:', err);
      else console.log(`✓ Devices: ${rows[0].count}`);
    });

    db.all('SELECT COUNT(*) as count FROM contacts', (err, rows) => {
      if (err) console.error('Error:', err);
      else console.log(`✓ Contacts: ${rows[0].count}`);
    });

    db.all('SELECT COUNT(*) as count FROM sessions', (err, rows) => {
      if (err) console.error('Error:', err);
      else {
        console.log(`✓ Sessions: ${rows[0].count}`);
        console.log('\nDone! Sample data created successfully.');
        console.log('\nYou can now:');
        console.log('  node examples.js analyze');
        console.log('  node examples.js spreadsheet');
        console.log('  sqlite3 logmein_data.db');
        db.close();
      }
    });
  });
};

// Run everything
console.log('Creating sample database...\n');
createTables();

setTimeout(() => {
  insertDevices();
  insertContacts();
  insertSessions();
  setTimeout(verifyData, 1000);
}, 500);
