/**
 * LogMeIn ETL - CSV Data Examples
 * Works with imported CSV data - no API calls needed
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');

// ========== EXAMPLE 1: Analyze Imported Data ==========
async function analyzeImportedData() {
  console.log('Analyzing imported CSV data...\n');

  const db = new sqlite3.Database('./logmein_data.db', (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
  });

  try {
    // Query statistics
    const stats = {
      totalDevices: await query(db, 'SELECT COUNT(*) as count FROM devices'),
      devicesByPlatform: await query(db, `
        SELECT platform, COUNT(*) as count FROM devices 
        GROUP BY platform ORDER BY count DESC
      `),
      onlineDevices: await query(db, `
        SELECT COUNT(*) as count FROM devices WHERE isOnline = 1
      `),
      totalContacts: await query(db, 'SELECT COUNT(*) as count FROM contacts'),
      totalSessions: await query(db, 'SELECT COUNT(*) as count FROM sessions'),
      avgSessionDuration: await query(db, `
        SELECT AVG(duration) as avg_duration FROM sessions WHERE duration IS NOT NULL
      `),
    };

    console.log('=== Data Analysis ===\n');
    console.log(`Total Devices: ${stats.totalDevices[0].count}`);
    console.log(`Online Devices: ${stats.onlineDevices[0].count}`);
    
    console.log('\nDevices by Platform:');
    stats.devicesByPlatform.forEach(row => {
      console.log(`  ${row.platform}: ${row.count}`);
    });

    console.log(`\nTotal Contacts: ${stats.totalContacts[0].count}`);
    console.log(`Total Sessions: ${stats.totalSessions[0].count}`);
    console.log(`Avg Session Duration: ${Math.round(stats.avgSessionDuration[0].avg_duration || 0)} seconds`);

    db.close();
  } catch (error) {
    console.error('Analysis failed:', error.message);
    db.close();
    process.exit(1);
  }
}

// ========== EXAMPLE 2: Export to CSV ==========
async function exportToCSV() {
  console.log('Exporting data to CSV...\n');

  const db = new sqlite3.Database('./logmein_data.db', (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
  });

  try {
    // Create export directory
    await fs.mkdir('exports', { recursive: true });

    // Export devices
    const devices = await query(db, 'SELECT * FROM devices ORDER BY name');
    const devicesCsv = jsonToCSV(devices);
    await fs.writeFile('exports/devices.csv', devicesCsv);
    console.log(`✅ Exported ${devices.length} devices to exports/devices.csv`);

    // Export contacts
    const contacts = await query(db, 'SELECT * FROM contacts ORDER BY name');
    const contactsCsv = jsonToCSV(contacts);
    await fs.writeFile('exports/contacts.csv', contactsCsv);
    console.log(`✅ Exported ${contacts.length} contacts to exports/contacts.csv`);

    // Export sessions
    const sessions = await query(db, 'SELECT * FROM sessions ORDER BY startTime DESC');
    const sessionsCsv = jsonToCSV(sessions);
    await fs.writeFile('exports/sessions.csv', sessionsCsv);
    console.log(`✅ Exported ${sessions.length} sessions to exports/sessions.csv`);

    console.log('\n📂 Files created in exports/ folder');
    console.log('   Open in Excel: File → Open → Select CSV file');

    db.close();
  } catch (error) {
    console.error('Export failed:', error.message);
    db.close();
    process.exit(1);
  }
}

// ========== EXAMPLE 3: Spreadsheet-Ready Export ==========
async function spreadsheetReadyExport() {
  console.log('Generating spreadsheet-ready exports...\n');

  const db = new sqlite3.Database('./logmein_data.db', (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
  });

  try {
    // Create timestamped export directory
    const timestamp = new Date().toISOString().split('T')[0];
    const exportDir = `exports/${timestamp}`;
    await fs.mkdir(exportDir, { recursive: true });

    // Device summary
    const deviceSummary = await query(db, `
      SELECT 
        id,
        name,
        platform,
        isOnline,
        ipAddress,
        lastSeen,
        createdAt
      FROM devices
      ORDER BY name
    `);

    // Contact summary
    const contactSummary = await query(db, `
      SELECT 
        id,
        name,
        email,
        phone,
        lastModified
      FROM contacts
      ORDER BY name
    `);

    // Device status report
    const statusReport = await query(db, `
      SELECT 
        platform,
        COUNT(*) as total_devices,
        SUM(CASE WHEN isOnline = 1 THEN 1 ELSE 0 END) as online_devices,
        ROUND(100.0 * SUM(CASE WHEN isOnline = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as online_percentage
      FROM devices
      GROUP BY platform
      ORDER BY total_devices DESC
    `);

    // Session summary
    const sessionSummary = await query(db, `
      SELECT 
        COUNT(*) as total_sessions,
        ROUND(AVG(duration), 0) as avg_duration_seconds,
        MIN(startTime) as earliest_session,
        MAX(startTime) as latest_session
      FROM sessions
    `);

    // Export files
    await fs.writeFile(`${exportDir}/device_summary.csv`, jsonToCSV(deviceSummary));
    await fs.writeFile(`${exportDir}/contact_summary.csv`, jsonToCSV(contactSummary));
    await fs.writeFile(`${exportDir}/status_report.csv`, jsonToCSV(statusReport));

    // Create README
    const readme = `# LogMeIn Inventory Export - ${timestamp}

## Files in this export:

1. device_summary.csv - All devices with status
2. contact_summary.csv - All contacts  
3. status_report.csv - Platform breakdown

## How to use in Excel:

1. Open Excel
2. File → Open → Select a CSV file
3. Data → Refresh All (for daily updates)

## Statistics:

Total Devices: ${deviceSummary.length}
Total Contacts: ${contactSummary.length}
Total Sessions: ${sessionSummary[0].total_sessions}
Avg Session Duration: ${sessionSummary[0].avg_duration_seconds} seconds

---
Generated: ${new Date().toLocaleString()}
`;

    await fs.writeFile(`${exportDir}/README.txt`, readme);

    console.log(`✅ Export complete!`);
    console.log(`📁 Location: ${exportDir}/`);
    console.log(`\n📊 Files created:`);
    console.log(`  • device_summary.csv (${deviceSummary.length} devices)`);
    console.log(`  • contact_summary.csv (${contactSummary.length} contacts)`);
    console.log(`  • status_report.csv (by platform)`);
    console.log(`  • README.txt (instructions)`);
    console.log(`\n💡 Open any CSV file in Excel to view!`);

    db.close();
  } catch (error) {
    console.error('Export failed:', error.message);
    db.close();
    process.exit(1);
  }
}

// ========== EXAMPLE 4: Quick Stats ==========
async function quickStats() {
  console.log('Quick Statistics\n');

  const db = new sqlite3.Database('./logmein_data.db', (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
  });

  try {
    const stats = await query(db, `
      SELECT
        (SELECT COUNT(*) FROM devices) as devices,
        (SELECT COUNT(*) FROM contacts) as contacts,
        (SELECT COUNT(*) FROM sessions) as sessions,
        (SELECT SUM(CASE WHEN isOnline = 1 THEN 1 ELSE 0 END) FROM devices) as online_devices,
        (SELECT COUNT(DISTINCT platform) FROM devices) as platforms
    `);

    const s = stats[0];
    console.log(`Devices:        ${s.devices}`);
    console.log(`  Online:       ${s.online_devices || 0}`);
    console.log(`  Platforms:    ${s.platforms || 0}`);
    console.log(`Contacts:       ${s.contacts}`);
    console.log(`Sessions:       ${s.sessions}`);

    db.close();
  } catch (error) {
    console.error('Failed:', error.message);
    db.close();
    process.exit(1);
  }
}

// ========== HELPER FUNCTIONS ==========

/**
 * Query database (returns promise)
 */
function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Convert JSON array to CSV string
 */
function jsonToCSV(jsonArray) {
  if (!jsonArray || jsonArray.length === 0) {
    return '';
  }

  const headers = Object.keys(jsonArray[0]);
  const headerLine = headers.join(',');

  const dataLines = jsonArray.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Handle null/undefined
      if (value === null || value === undefined) {
        return '';
      }
      // Escape quotes and wrap in quotes if contains comma
      const strValue = String(value);
      if (strValue.includes(',') || strValue.includes('"')) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    }).join(',');
  });

  return [headerLine, ...dataLines].join('\n');
}

// ========== MAIN ==========

const example = process.argv[2] || 'analyze';

switch (example) {
  case 'analyze':
    analyzeImportedData();
    break;
  case 'csv':
    exportToCSV();
    break;
  case 'spreadsheet':
    spreadsheetReadyExport();
    break;
  case 'stats':
    quickStats();
    break;
  default:
    console.log(`
Usage: node example-csv.js [example]

Available examples (CSV data only - no API needed):
  analyze     - Analyze imported CSV data (DEFAULT)
  csv         - Export all tables to CSV
  spreadsheet - Export formatted spreadsheets with timestamps
  stats       - Quick statistics

Examples:

  # Analyze your imported data
  node example-csv.js analyze

  # Export to spreadsheet
  node example-csv.js spreadsheet

  # Quick stats
  node example-csv.js  stats

First, import your CSV data:
  npm run import:sample              # Use sample data
  node import-data.js import devices your_file.csv

Then analyze:
  node example-csv.js analyze
  node example-csv.js spreadsheet
    `);
}

module.exports = {
  analyzeImportedData,
  exportToCSV,
  spreadsheetReadyExport,
  quickStats,
};
