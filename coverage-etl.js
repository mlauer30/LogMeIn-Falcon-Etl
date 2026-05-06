/**
 * Coverage ETL with Data Normalization & Deduplication
 * Handles LogMeIn hierarchical exports (multiple rows per computer)
 * Imports CSVs/TSVs, deduplicates, normalizes, calculates coverage
 */

const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const { initializeDatabase } = require('./database-schema');

class CoverageETL {
  constructor(dbPath = './inventory.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Find column index by matching multiple possible names
   */
  findColumnIndex(headers, possibleNames) {
    for (const name of possibleNames) {
      const idx = headers.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  /**
   * Detect delimiter (comma, tab, semicolon)
   */
  detectDelimiter(line) {
    const tabCount = (line.match(/\t/g) || []).length;
    const commaCount = (line.match(/,/g) || []).length;
    const semicolonCount = (line.match(/;/g) || []).length;

    if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
    if (semicolonCount > commaCount) return ';';
    return ',';
  }

  /**
   * Normalize hostname to uppercase
   */
  normalizeHostname(hostname) {
    if (!hostname) return null;
    return String(hostname).trim().toUpperCase();
  }

  /**
   * Normalize platform name
   */
  normalizePlatform(platform) {
    if (!platform) return 'UNKNOWN';
    const p = String(platform).trim().toLowerCase();
    
    if (p.includes('windows')) {
      if (p.includes('server')) return 'Windows Server';
      return 'Windows';
    }
    if (p.includes('macos') || p.includes('mac os') || p.includes('darwin')) return 'macOS';
    if (p.includes('linux') || p.includes('ubuntu') || p.includes('centos') || 
        p.includes('rhel') || p.includes('debian') || p.includes('suse')) return 'Linux';
    
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  /**
   * Normalize status
   */
  normalizeStatus(status) {
    if (!status) return 'Unknown';
    const s = String(status).trim().toLowerCase();
    
    if (s === '1' || s === 'true' || s === 'yes' || s === 'online' || s === 'active') {
      return 'Online';
    }
    if (s === '0' || s === 'false' || s === 'no' || s === 'offline' || s === 'inactive') {
      return 'Offline';
    }
    
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /**
   * Normalize OS version
   */
  normalizeOSVersion(osVersion) {
    if (!osVersion) return null;
    return String(osVersion).trim();
  }

  /**
   * Normalize agent version
   */
  normalizeAgentVersion(agentVersion) {
    if (!agentVersion) return null;
    return String(agentVersion).trim();
  }

  /**
   * Normalize IP address
   */
  normalizeIPAddress(ip) {
    if (!ip) return null;
    return String(ip).trim();
  }

  /**
   * Initialize database
   */
  async initialize() {
    this.db = await initializeDatabase(this.dbPath);
  }

  /**
   * Import LogMeIn CSV with normalization and deduplication
   * Handles hierarchical data (multiple rows per computer)
   */
  async importLogMeIn(csvPath) {
    console.log(`\n[INFO] Importing LogMeIn data from: ${csvPath}`);

    try {
      const content = await fs.readFile(csvPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV file is empty or has no data rows');
      }

      // Detect delimiter
      const delimiter = this.detectDelimiter(lines[0]);
      console.log(`[INFO] Detected delimiter: ${delimiter === '\t' ? 'TAB' : delimiter}`);

      // Parse header (case-insensitive)
      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
      
      // Find column indices - flexible matching
      const hostnameIdx = this.findColumnIndex(headers, ['host name', 'hostname', 'id', 'computer']);
      const platformIdx = this.findColumnIndex(headers, ['os type', 'platform', 'os']);
      const ipIdx = this.findColumnIndex(headers, ['ip address', 'ipaddress', 'ip']);
      const descriptionIdx = this.findColumnIndex(headers, ['computer description', 'description', 'name']);
      const lastSeenIdx = this.findColumnIndex(headers, ['last boot date', 'lastseen', 'last seen']);

      if (hostnameIdx === -1) {
        throw new Error('CSV must have a hostname column (Host Name, hostname, id, or computer)');
      }

      console.log(`[INFO] Column mapping - Hostname: ${hostnameIdx}, Platform: ${platformIdx}, IP: ${ipIdx}`);

      // Parse and normalize data with deduplication
      const devices = [];
      const seenHostnames = new Set();
      let duplicateCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim());
        if (values.length < 2) continue;

        const rawHostname = values[hostnameIdx];
        const hostname = this.normalizeHostname(rawHostname);
        
        if (!hostname) continue;

        // Skip if we've already seen this hostname (deduplication)
        if (seenHostnames.has(hostname)) {
          duplicateCount++;
          continue;
        }

        seenHostnames.add(hostname);

        devices.push({
          id: hostname,
          hostname: hostname,
          platform: this.normalizePlatform(platformIdx !== -1 ? values[platformIdx] : ''),
          ipAddress: this.normalizeIPAddress(ipIdx !== -1 ? values[ipIdx] : ''),
          status: 'Online', // LogMeIn devices are assumed online if in inventory
          lastSeen: lastSeenIdx !== -1 ? values[lastSeenIdx] : new Date().toISOString(),
        });
      }

      console.log(`[INFO] Parsed ${devices.length} unique computers (skipped ${duplicateCount} duplicate rows)`);

      return await this.insertLogMeInDevices(devices);
    } catch (error) {
      console.error(`[ERROR] Failed to import LogMeIn CSV:`, error.message);
      throw error;
    }
  }

  /**
   * Insert LogMeIn devices
   */
  async insertLogMeInDevices(devices) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO logmein_devices 
          (id, hostname, platform, ipAddress, status, lastSeen, importedAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        let inserted = 0;
        devices.forEach(device => {
          stmt.run(
            device.id,
            device.hostname,
            device.platform,
            device.ipAddress,
            device.status,
            device.lastSeen,
            (err) => {
              if (err) console.error('Insert error:', err);
              else inserted++;
            }
          );
        });

        stmt.finalize((err) => {
          if (err) reject(err);
          else {
            console.log(`[OK] Inserted ${inserted} LogMeIn devices into database`);
            this.logEvent('LogMeIn', 'import', 'SUCCESS', `Imported ${inserted} devices`, inserted);
            resolve(inserted);
          }
        });
      });
    });
  }

  /**
   * Import CrowdStrike CSV with normalization
   */
  async importCrowdStrike(csvPath) {
    console.log(`\n[INFO] Importing CrowdStrike data from: ${csvPath}`);

    try {
      const content = await fs.readFile(csvPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      if (lines.length < 2) {
        throw new Error('CSV file is empty or has no data rows');
      }

      // Detect delimiter
      const delimiter = this.detectDelimiter(lines[0]);

      // Parse header
      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
      const hostnameIdx = this.findColumnIndex(headers, ['id', 'hostname', 'host name', 'computer']);
      const osVersionIdx = this.findColumnIndex(headers, ['osversion', 'os version', 'os']);
      const statusIdx = this.findColumnIndex(headers, ['status']);
      const agentVersionIdx = this.findColumnIndex(headers, ['agentversion', 'agent version', 'version']);

      if (hostnameIdx === -1) {
        throw new Error('CSV must have a hostname column (id, hostname, or host name)');
      }

      // Parse and normalize data
      const hosts = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim());
        if (values.length < 2) continue;

        const hostname = this.normalizeHostname(values[hostnameIdx]);
        if (!hostname) continue;

        hosts.push({
          id: hostname,
          hostname: hostname,
          osVersion: this.normalizeOSVersion(osVersionIdx !== -1 ? values[osVersionIdx] : ''),
          status: this.normalizeStatus(statusIdx !== -1 ? values[statusIdx] : ''),
          agentVersion: this.normalizeAgentVersion(agentVersionIdx !== -1 ? values[agentVersionIdx] : ''),
        });
      }

      console.log(`[INFO] Parsed and normalized ${hosts.length} CrowdStrike hosts`);

      return await this.insertCrowdStrikeHosts(hosts);
    } catch (error) {
      console.error(`[ERROR] Failed to import CrowdStrike CSV:`, error.message);
      throw error;
    }
  }

  /**
   * Insert CrowdStrike hosts
   */
  async insertCrowdStrikeHosts(hosts) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO crowdstrike_hosts
          (id, hostname, osVersion, status, agentVersion, importedAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        let inserted = 0;
        hosts.forEach(host => {
          stmt.run(
            host.id,
            host.hostname,
            host.osVersion,
            host.status,
            host.agentVersion,
            (err) => {
              if (err) console.error('Insert error:', err);
              else inserted++;
            }
          );
        });

        stmt.finalize((err) => {
          if (err) reject(err);
          else {
            console.log(`[OK] Inserted ${inserted} CrowdStrike hosts into database`);
            this.logEvent('CrowdStrike', 'import', 'SUCCESS', `Imported ${inserted} hosts`, inserted);
            resolve(inserted);
          }
        });
      });
    });
  }

  /**
   * Calculate device coverage
   */
  async calculateCoverage() {
    console.log(`\n[INFO] Calculating device coverage...`);

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.all(`
          SELECT DISTINCT hostname FROM (
            SELECT hostname FROM logmein_devices
            UNION
            SELECT hostname FROM crowdstrike_hosts
          )
          ORDER BY hostname
        `, (err, allHostnames) => {
          if (err) {
            reject(err);
            return;
          }

          console.log(`[INFO] Found ${allHostnames.length} unique hostnames to match`);

          this.db.run('DELETE FROM device_coverage', (err) => {
            if (err) {
              reject(err);
              return;
            }

            const stmt = this.db.prepare(`
              INSERT INTO device_coverage
              (hostname, inLogMeIn, inCrowdStrike, logmeinStatus, crowdstrikeStatus, 
               logmeinLastSeen, crowdstrikeLastSeen, coverageStatus, lastUpdated)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `);

            let processed = 0;

            allHostnames.forEach(row => {
              const hostname = row.hostname;

              this.db.get('SELECT status, lastSeen FROM logmein_devices WHERE hostname = ?', [hostname], (err, lm) => {
                this.db.get('SELECT status FROM crowdstrike_hosts WHERE hostname = ?', [hostname], (err, cs) => {
                  const inLogMeIn = lm ? 1 : 0;
                  const inCrowdStrike = cs ? 1 : 0;
                  
                  let coverageStatus = 'UNKNOWN';
                  if (inLogMeIn && inCrowdStrike) {
                    coverageStatus = 'FULL_COVERAGE';
                  } else if (inLogMeIn) {
                    coverageStatus = 'LOGMEIN_ONLY';
                  } else if (inCrowdStrike) {
                    coverageStatus = 'CROWDSTRIKE_ONLY';
                  }

                  stmt.run(
                    hostname,
                    inLogMeIn,
                    inCrowdStrike,
                    lm ? lm.status : null,
                    cs ? cs.status : null,
                    lm ? lm.lastSeen : null,
                    cs ? new Date().toISOString() : null,
                    coverageStatus
                  );

                  processed++;
                  if (processed === allHostnames.length) {
                    stmt.finalize((err) => {
                      if (err) reject(err);
                      else {
                        console.log(`[OK] Calculated coverage for ${processed} devices`);
                        this.logEvent('Coverage', 'calculate', 'SUCCESS', `Calculated coverage for ${processed} devices`, processed);
                        resolve(processed);
                      }
                    });
                  }
                });
              });
            });
          });
        });
      });
    });
  }

  /**
   * Get coverage report
   */
  async getCoverageReport() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          hostname,
          CASE WHEN inLogMeIn THEN 'Yes' ELSE 'No' END as "In LogMeIn",
          CASE WHEN inCrowdStrike THEN 'Yes' ELSE 'No' END as "In CrowdStrike",
          coverageStatus as "Coverage Status"
        FROM device_coverage
        ORDER BY coverageStatus DESC, hostname
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Get coverage summary
   */
  async getCoverageSummary() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT
          coverageStatus,
          COUNT(*) as count
        FROM device_coverage
        GROUP BY coverageStatus
        ORDER BY count DESC
      `, (err, rows) => {
        if (err) reject(err);
        else {
          const summary = {
            total: 0,
            fullCoverage: 0,
            logmeinOnly: 0,
            crowdstrikeOnly: 0,
          };

          rows.forEach(row => {
            const count = row.count;
            summary.total += count;
            if (row.coverageStatus === 'FULL_COVERAGE') summary.fullCoverage = count;
            else if (row.coverageStatus === 'LOGMEIN_ONLY') summary.logmeinOnly = count;
            else if (row.coverageStatus === 'CROWDSTRIKE_ONLY') summary.crowdstrikeOnly = count;
          });

          resolve(summary);
        }
      });
    });
  }

  /**
   * Log ETL event
   */
  logEvent(system, action, status, message, recordsProcessed) {
    this.db.run(
      `INSERT INTO etl_logs (system, action, status, message, recordsProcessed)
       VALUES (?, ?, ?, ?, ?)`,
      [system, action, status, message, recordsProcessed]
    );
  }

  /**
   * Close database
   */
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('[OK] Database connection closed');
      });
    }
  }
}

module.exports = CoverageETL;
