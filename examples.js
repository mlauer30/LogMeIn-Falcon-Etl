/**
 * LogMeIn Central ETL - Usage Examples
 * Demonstrates how to use the ETL pipeline in different scenarios
 */

const LogMeInETL = require('./logmein-etl');

// ========== EXAMPLE 1: Basic ETL Execution ==========
async function basicETL() {
  console.log('Starting basic ETL execution...\n');

  const etl = new LogMeInETL({
    accessToken: process.env.LOGMEIN_API_TOKEN,
    apiBaseUrl: 'https://api.logmeincentral.com/v1',
    dbPath: './logmein_data.db',
  });

  // Listen for events
  etl.on('log', (message) => {
    console.log(`[LOG] ${message}`);
  });

  etl.on('error', (message) => {
    console.error(`[ERROR] ${message}`);
  });

  etl.on('complete', (stats) => {
    console.log('\n=== ETL Completed ===');
    console.log(`Extracted: ${stats.extracted}`);
    console.log(`Transformed: ${stats.transformed}`);
    console.log(`Loaded: ${stats.loaded}`);
    console.log(`Duration: ${stats.duration}s`);
    console.log(`Success Rate: ${stats.successRate}`);
    if (stats.errors.length > 0) {
      console.log(`Errors: ${stats.errors.length}`);
      stats.errors.forEach(err => console.log(`  - ${err}`));
    }
  });

  try {
    await etl.run();
  } catch (error) {
    console.error('ETL failed:', error.message);
  }
}

// ========== EXAMPLE 2: Custom Date Range for Sessions ==========
async function customDateRangeETL() {
  console.log('Starting ETL with custom date range...\n');

  const etl = new LogMeInETL({
    accessToken: process.env.LOGMEIN_API_TOKEN,
  });

  etl.on('log', (msg) => console.log(`[LOG] ${msg}`));
  etl.on('error', (msg) => console.error(`[ERROR] ${msg}`));

  try {
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-12-31');

    await etl.run({ startDate, endDate });
  } catch (error) {
    console.error('ETL failed:', error.message);
  }
}

// ========== EXAMPLE 3: Extract and Analyze ==========
async function extractAndAnalyze() {
  console.log('Extracting data and running analysis...\n');

  const etl = new LogMeInETL({
    accessToken: process.env.LOGMEIN_API_TOKEN,
    batchSize: 200, // Larger batches for faster extraction
  });

  etl.on('log', (msg) => console.log(`[LOG] ${msg}`));

  try {
    await etl.initializeDatabase();

    // Extract data
    const devices = await etl.extractDevices();
    const contacts = await etl.extractContacts();
    const sessions = await etl.extractSessions(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      new Date()
    );

    // Transform
    const transformedDevices = etl.transformDevices(devices);
    const transformedContacts = etl.transformContacts(contacts);
    const transformedSessions = etl.transformSessions(sessions);

    // Load
    await etl.loadDevices(transformedDevices);
    await etl.loadContacts(transformedContacts);
    await etl.loadSessions(transformedSessions);

    // Analyze
    const stats = {
      totalDevices: await etl.query('SELECT COUNT(*) as count FROM devices'),
      onlineDevices: await etl.query('SELECT COUNT(*) as count FROM devices WHERE isOnline = 1'),
      totalContacts: await etl.query('SELECT COUNT(*) as count FROM contacts'),
      totalSessions: await etl.query('SELECT COUNT(*) as count FROM sessions'),
      avgSessionDuration: await etl.query(`
        SELECT AVG(duration) as avgDuration FROM sessions WHERE duration IS NOT NULL
      `),
    };

    console.log('\n=== Analysis Results ===');
    console.log(`Total Devices: ${stats.totalDevices[0].count}`);
    console.log(`Online Devices: ${stats.onlineDevices[0].count}`);
    console.log(`Total Contacts: ${stats.totalContacts[0].count}`);
    console.log(`Total Sessions: ${stats.totalSessions[0].count}`);
    console.log(`Avg Session Duration: ${Math.round(stats.avgSessionDuration[0].avgDuration || 0)} seconds`);

    etl.close();
  } catch (error) {
    console.error('Analysis failed:', error.message);
  }
}

// ========== EXAMPLE 4: Scheduled ETL with Incremental Load ==========
async function scheduledETL() {
  const schedule = require('node-schedule');

  console.log('Setting up scheduled ETL (runs daily at 2 AM)...\n');

  // Run every day at 2:00 AM
  schedule.scheduleJob('0 2 * * *', async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled ETL...`);

    const etl = new LogMeInETL({
      accessToken: process.env.LOGMEIN_API_TOKEN,
    });

    etl.on('log', (msg) => console.log(`[LOG] ${msg}`));
    etl.on('error', (msg) => console.error(`[ERROR] ${msg}`));
    etl.on('complete', (stats) => {
      console.log(`Completed - Loaded: ${stats.loaded}, Errors: ${stats.errors.length}`);
    });

    try {
      // Extract from last 24 hours
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

      await etl.run({ startDate, endDate });
    } catch (error) {
      console.error('Scheduled ETL failed:', error.message);
    }
  });

  console.log('Scheduler initialized. Process will continue running...');
}

// ========== EXAMPLE 5: Error Handling and Retry ==========
async function robustETL() {
  console.log('Starting ETL with robust error handling...\n');

  const etl = new LogMeInETL({
    accessToken: process.env.LOGMEIN_API_TOKEN,
    retryAttempts: 5, // More aggressive retry
    retryDelay: 2000, // 2 second base delay with exponential backoff
    requestTimeout: 60000, // 60 second timeout
  });

  etl.on('log', (msg) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
  });

  etl.on('error', (msg) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR: ${msg}`);
  });

  etl.on('complete', (stats) => {
    if (stats.errors.length > 0) {
      console.log('\n⚠️  ETL completed with errors:');
      stats.errors.forEach((err, idx) => console.log(`  ${idx + 1}. ${err}`));
    } else {
      console.log('\n✅ ETL completed successfully!');
    }
  });

  try {
    const result = await etl.run();
    return result;
  } catch (error) {
    console.error('ETL failed after all retries:', error.message);
    // Could implement fallback logic here
  }
}

// ========== EXAMPLE 6: Data Export to CSV ==========
async function exportDataToCSV() {
  const fs = require('fs').promises;
  const csv = require('csv-stringify/sync');

  console.log('Extracting and exporting data to CSV...\n');

  const etl = new LogMeInETL({
    accessToken: process.env.LOGMEIN_API_TOKEN,
  });

  try {
    await etl.initializeDatabase();
    await etl.run();

    // Create export directory
    await fs.mkdir('exports', { recursive: true });

    // Export devices
    const devices = await etl.query('SELECT * FROM devices');
    const devicesCsv = csv.stringify(devices, { header: true });
    await fs.writeFile('exports/devices.csv', devicesCsv);

    // Export contacts
    const contacts = await etl.query('SELECT * FROM contacts');
    const contactsCsv = csv.stringify(contacts, { header: true });
    await fs.writeFile('exports/contacts.csv', contactsCsv);

    // Export sessions
    const sessions = await etl.query('SELECT * FROM sessions');
    const sessionsCsv = csv.stringify(sessions, { header: true });
    await fs.writeFile('exports/sessions.csv', sessionsCsv);

    // Export ETL logs
    const logs = await etl.query('SELECT * FROM etl_logs ORDER BY timestamp DESC');
    const logsCsv = csv.stringify(logs, { header: true });
    await fs.writeFile('exports/etl_logs.csv', logsCsv);

    console.log('✅ Data exported successfully!');
    console.log('Files created in exports/ folder:');
    console.log('  - devices.csv');
    console.log('  - contacts.csv');
    console.log('  - sessions.csv');
    console.log('  - etl_logs.csv');
    console.log('\n📊 Import these CSVs to Excel:');
    console.log('  1. Open Excel');
    console.log('  2. File → Open → Select CSV file');
    console.log('  3. Data → Refresh All (for daily updates)');

    etl.close();
  } catch (error) {
    console.error('Export failed:', error.message);
  }
}

// ========== EXAMPLE 7: Spreadsheet-Ready Export ==========
async function spreadsheetReadyExport() {
  const fs = require('fs').promises;
  const csv = require('csv-stringify/sync');

  console.log('Generating spreadsheet-ready exports...\n');

  const etl = new LogMeInETL({
    accessToken: process.env.LOGMEIN_API_TOKEN,
  });

  try {
    await etl.initializeDatabase();
    await etl.run();

    // Create export directory with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const exportDir = `exports/${timestamp}`;
    await fs.mkdir(exportDir, { recursive: true });

    // Device summary (for quick overview)
    const deviceSummary = await etl.query(`
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
    const contactSummary = await etl.query(`
      SELECT 
        id,
        name,
        email,
        phone,
        lastModified
      FROM contacts
      ORDER BY name
    `);

    // Session summary with stats
    const sessionSummary = await etl.query(`
      SELECT 
        DATE(startTime) as date,
        COUNT(*) as session_count,
        ROUND(AVG(duration), 0) as avg_duration_seconds,
        MIN(startTime) as first_session,
        MAX(endTime) as last_session
      FROM sessions
      GROUP BY DATE(startTime)
      ORDER BY date DESC
    `);

    // Device status report
    const statusReport = await etl.query(`
      SELECT 
        platform,
        COUNT(*) as total_devices,
        SUM(CASE WHEN isOnline = 1 THEN 1 ELSE 0 END) as online_devices,
        ROUND(100.0 * SUM(CASE WHEN isOnline = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as online_percentage,
        MIN(lastSeen) as earliest_last_seen,
        MAX(lastSeen) as latest_last_seen
      FROM devices
      GROUP BY platform
      ORDER BY total_devices DESC
    `);

    // Export files
    await fs.writeFile(`${exportDir}/device_summary.csv`, 
      csv.stringify(deviceSummary, { header: true }));
    await fs.writeFile(`${exportDir}/contact_summary.csv`, 
      csv.stringify(contactSummary, { header: true }));
    await fs.writeFile(`${exportDir}/session_summary.csv`, 
      csv.stringify(sessionSummary, { header: true }));
    await fs.writeFile(`${exportDir}/status_report.csv`, 
      csv.stringify(statusReport, { header: true }));

    // Create README
    const readme = `# LogMeIn Inventory Export - ${timestamp}

## Files in this export:

1. **device_summary.csv** - All devices with status
2. **contact_summary.csv** - All contacts
3. **session_summary.csv** - Session statistics by date
4. **status_report.csv** - Platform breakdown and availability

## How to use in Excel:

1. Open Excel
2. File → Open → Select a CSV file
3. Data → Refresh All (to auto-update daily)

## Statistics:

Total Devices: ${deviceSummary.length}
Total Contacts: ${contactSummary.length}
Date Range: ${sessionSummary[sessionSummary.length - 1]?.date || 'N/A'} to ${sessionSummary[0]?.date || 'N/A'}

---
Generated: ${new Date().toLocaleString()}
`;

    await fs.writeFile(`${exportDir}/README.txt`, readme);

    console.log(`✅ Export complete!`);
    console.log(`📁 Location: ${exportDir}/`);
    console.log(`\n📊 Files created:`);
    console.log(`  • device_summary.csv (${deviceSummary.length} devices)`);
    console.log(`  • contact_summary.csv (${contactSummary.length} contacts)`);
    console.log(`  • session_summary.csv (${sessionSummary.length} days)`);
    console.log(`  • status_report.csv (by platform)`);
    console.log(`  • README.txt (instructions)`);
    console.log(`\n💡 Pro tip: Zip the folder and email to stakeholders!`);

    etl.close();
  } catch (error) {
    console.error('Export failed:', error.message);
  }
}

// ========== MAIN ==========
const example = process.argv[2] || 'basic';

switch (example) {
  case 'basic':
    basicETL();
    break;
  case 'daterange':
    customDateRangeETL();
    break;
  case 'analyze':
    extractAndAnalyze();
    break;
  case 'scheduled':
    scheduledETL();
    break;
  case 'robust':
    robustETL();
    break;
  case 'csv':
    exportDataToCSV();
    break;
  case 'spreadsheet':
    spreadsheetReadyExport();
    break;
  default:
    console.log(`
Usage: node examples.js [example]

Available examples:
  basic         - Basic ETL execution
  daterange     - Custom date range for sessions
  analyze       - Extract and analyze data
  scheduled     - Scheduled ETL (requires node-schedule)
  robust        - Robust error handling
  csv           - Export all tables to CSV
  spreadsheet   - Spreadsheet-ready exports with formatting

Environment:
  Set LOGMEIN_API_TOKEN in .env or environment
    `);
}

module.exports = {
  basicETL,
  customDateRangeETL,
  extractAndAnalyze,
  scheduledETL,
  robustETL,
  exportDataToCSV,
  spreadsheetReadyExport,
};
