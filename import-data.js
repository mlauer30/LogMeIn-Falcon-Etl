#!/usr/bin/env node

/**
 * Import Excel/CSV Data into SQLite
 * CLI tool for loading raw inventory data
 */

const ExcelDataImporter = require('./excel-data-importer');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const importer = new ExcelDataImporter('./logmein_data.db');

  try {
    await importer.initialize();

    switch (command) {
      case 'sample':
        // Generate sample data for testing
        await importer.generateSampleData();
        break;

      case 'templates':
        // Create CSV templates
        await importer.createTemplates();
        break;

      case 'import':
        // Import specific file
        const table = args[1];
        const filePath = args[2];

        if (!table || !filePath) {
          console.log('Usage: node import-data.js import <table> <file>');
          console.log('\nTables: devices, contacts, sessions');
          console.log('File: path/to/file.csv or path/to/file.json');
          process.exit(1);
        }

        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.csv') {
          await importer.importFromCSV(filePath, table);
        } else if (ext === '.json') {
          await importer.importFromJSON(filePath, table);
        } else {
          console.error('❌ Unsupported file format. Use .csv or .json');
          process.exit(1);
        }
        break;

      case 'stats':
        // Show database statistics
        const stats = await importer.getStatistics();
        console.log('\n📊 Database Statistics:');
        console.log(`  Devices:  ${stats.totalDevices}`);
        console.log(`  Contacts: ${stats.totalContacts}`);
        console.log(`  Sessions: ${stats.totalSessions}`);
        console.log(`  ETL Logs: ${stats.totalLogs}`);
        break;

      case 'clear':
        // Clear all data (dangerous!)
        console.log('⚠️  This will delete all data in the database!');
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        rl.question('Type "yes" to confirm: ', async (answer) => {
          if (answer === 'yes') {
            await importer.query('DELETE FROM devices');
            await importer.query('DELETE FROM contacts');
            await importer.query('DELETE FROM sessions');
            await importer.query('DELETE FROM etl_logs');
            console.log('✅ Database cleared');
          } else {
            console.log('Cancelled');
          }
          rl.close();
          importer.close();
        });
        return;

      default:
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║         LogMeIn Data Importer - Excel/CSV to SQLite           ║
╚════════════════════════════════════════════════════════════════╝

Usage:
  node import-data.js <command>

Commands:

  sample                      Generate sample data for testing
                              Example: node import-data.js sample

  templates                   Create CSV template files
                              Example: node import-data.js templates

  import <table> <file>       Import data from CSV or JSON file
                              Example: node import-data.js import devices data.csv
                              
                              Tables: devices, contacts, sessions
                              File: path/to/file.csv or path/to/file.json

  stats                       Show database statistics
                              Example: node import-data.js stats

  clear                       Clear all data from database
                              Example: node import-data.js clear

Examples:

  1. Start with sample data:
     $ node import-data.js sample
     $ npm run example:analyze

  2. Import your own Excel data:
     $ node import-data.js templates           # Create templates
     # Fill in templates with your data
     $ node import-data.js import devices your_devices.csv
     $ node import-data.js import contacts your_contacts.csv
     $ node import-data.js import sessions your_sessions.csv

  3. Check what you have:
     $ node import-data.js stats

  4. Export to spreadsheet:
     $ npm run example:spreadsheet

  5. When ready, switch to API:
     Edit logmein-etl.js to use API instead of imported data

Data Format:

  DEVICES CSV (required columns):
    id, accountId, name, platform, type, isOnline, ipAddress, lastSeen

  CONTACTS CSV (required columns):
    id, accountId, name, email, phone, lastModified

  SESSIONS CSV (required columns):
    id, accountId, deviceId, contactId, startTime, endTime, sessionType

Format Tips:
  - isOnline: 0 or 1 (or true/false)
  - Dates: ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  - IDs: Any unique string
  - Keep data clean (no extra spaces, null values OK)

Questions?
  See: CONFIG.md, README.md, or QUICKSTART.md
        `);
        process.exit(0);
    }

    importer.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    importer.close();
    process.exit(1);
  }
}

main();
