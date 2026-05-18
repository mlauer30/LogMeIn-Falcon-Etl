/**
 * Database Schema - LogMeIn + CrowdStrike Coverage Tracking
 * Creates tables to track which devices are managed by each system
 */

const sqlite3 = require('sqlite3').verbose();

const schema = `
-- LogMeIn Devices
CREATE TABLE IF NOT EXISTS logmein_devices (
  id TEXT PRIMARY KEY,
  hostname TEXT UNIQUE NOT NULL,
  computerDescription TEXT,
  platform TEXT,
  ipAddress TEXT,
  status TEXT,
  lastSeen DATETIME,
  importedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CrowdStrike Hosts
CREATE TABLE IF NOT EXISTS crowdstrike_hosts (
  id TEXT PRIMARY KEY,
  hostname TEXT UNIQUE NOT NULL,
  osVersion TEXT,
  status TEXT,
  agentVersion TEXT,
  importedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Device Coverage Summary (the view you need)
CREATE TABLE IF NOT EXISTS device_coverage (
  hostname TEXT PRIMARY KEY,
  computerDescription TEXT,
  inLogMeIn INTEGER DEFAULT 0,
  inCrowdStrike INTEGER DEFAULT 0,
  logmeinStatus TEXT,
  crowdstrikeStatus TEXT,
  logmeinLastSeen DATETIME,
  crowdstrikeLastSeen DATETIME,
  coverageStatus TEXT,
  lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ETL Logs
CREATE TABLE IF NOT EXISTS etl_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  system TEXT,
  action TEXT,
  status TEXT,
  message TEXT,
  recordsProcessed INTEGER
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_logmein_hostname ON logmein_devices(hostname);
CREATE INDEX IF NOT EXISTS idx_crowdstrike_hostname ON crowdstrike_hosts(hostname);
CREATE INDEX IF NOT EXISTS idx_coverage_status ON device_coverage(coverageStatus);
CREATE INDEX IF NOT EXISTS idx_coverage_logmein ON device_coverage(inLogMeIn);
CREATE INDEX IF NOT EXISTS idx_coverage_crowdstrike ON device_coverage(inCrowdStrike);
`;

function initializeDatabase(dbPath = './inventory.db') {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      console.log(`[OK] Database opened: ${dbPath}`);

      // Split schema into individual statements and execute
      const statements = schema.split(';').filter(s => s.trim());

      db.serialize(() => {
        let completed = 0;
        statements.forEach((statement, index) => {
          db.run(statement, (err) => {
            if (err) {
              console.error(`[ERROR] Statement ${index + 1} failed:`, err.message);
            } else {
              completed++;
            }

            if (completed === statements.length) {
              console.log(`[OK] All ${statements.length} schema statements executed`);
              resolve(db);
            }
          });
        });
      });
    });
  });
}

module.exports = { initializeDatabase, schema };
