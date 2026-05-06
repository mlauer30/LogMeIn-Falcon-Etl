#!/usr/bin/env node

/**
 * Coverage ETL CLI
 * Import LogMeIn and CrowdStrike CSVs, track device coverage
 */

const CoverageETL = require('./coverage-etl');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  const etl = new CoverageETL('./inventory.db');

  try {
    await etl.initialize();

    switch (command) {
      case 'import':
        await handleImport(etl, args);
        break;

      case 'report':
        await handleReport(etl);
        break;

      case 'summary':
        await handleSummary(etl);
        break;

      case 'help':
      default:
        showHelp();
        break;
    }

    etl.close();
  } catch (error) {
    console.error('[ERROR]', error.message);
    etl.close();
    process.exit(1);
  }
}

async function handleImport(etl, args) {
  if (args.length < 2) {
    console.error('[ERROR] Usage: node coverage-cli.js import <system> <csvPath>');
    console.error('         Systems: logmein, crowdstrike, both');
    process.exit(1);
  }

  const system = args[1].toLowerCase();
  const csvPath = args[2];

  if (system === 'logmein' || system === 'both') {
    if (!csvPath && system === 'logmein') {
      console.error('[ERROR] CSV path required');
      process.exit(1);
    }
    const lmPath = system === 'logmein' ? csvPath : args[2];
    if (lmPath) {
      await etl.importLogMeIn(lmPath);
    }
  }

  if (system === 'crowdstrike' || system === 'both') {
    const csPath = system === 'both' ? args[3] : csvPath;
    if (csPath) {
      await etl.importCrowdStrike(csPath);
    }
  }

  // Recalculate coverage
  await etl.calculateCoverage();
  console.log('[OK] Coverage calculated');
}

async function handleReport(etl) {
  console.log('\n=== Device Coverage Report ===\n');

  const report = await etl.getCoverageReport();

  if (report.length === 0) {
    console.log('No devices found. Import LogMeIn and CrowdStrike CSVs first.');
    return;
  }

  // Print table
  console.table(report);

  // Also get summary
  const summary = await etl.getCoverageSummary();
  console.log('\n=== Coverage Summary ===');
  console.log(`Total Devices:        ${summary.total}`);
  console.log(`Full Coverage:        ${summary.fullCoverage}`);
  console.log(`LogMeIn Only:         ${summary.logmeinOnly}`);
  console.log(`CrowdStrike Only:     ${summary.crowdstrikeOnly}`);
  console.log(`Missing Both:         ${summary.missingBoth}`);
}

async function handleSummary(etl) {
  const summary = await etl.getCoverageSummary();

  console.log('\n=== Coverage Summary ===\n');
  console.log(`Total Devices:        ${summary.total}`);
  console.log(`Full Coverage:        ${summary.fullCoverage} (${((summary.fullCoverage / summary.total) * 100).toFixed(1)}%)`);
  console.log(`LogMeIn Only:         ${summary.logmeinOnly}`);
  console.log(`CrowdStrike Only:     ${summary.crowdstrikeOnly}`);
  console.log(`Missing Both:         ${summary.missingBoth}`);
  console.log('');
}

function showHelp() {
  console.log(`
Coverage ETL CLI - Track LogMeIn + CrowdStrike Device Coverage

Usage:
  node coverage-cli.js <command> [options]

Commands:

  import logmein <csvPath>
    Import LogMeIn devices from CSV file
    Example: node coverage-cli.js import logmein logmein_devices.csv

  import crowdstrike <csvPath>
    Import CrowdStrike hosts from CSV file
    Example: node coverage-cli.js import crowdstrike cs_hosts.csv

  import both <logmeinCsv> <crowdstrikeCsv>
    Import from both systems at once
    Example: node coverage-cli.js import both logmein.csv crowdstrike.csv

  report
    Show detailed coverage report for all devices
    Example: node coverage-cli.js report

  summary
    Show coverage summary statistics
    Example: node coverage-cli.js summary

  help
    Show this help message

CSV Format:

  LogMeIn CSV must have columns:
    id, hostname, platform, ipAddress, isOnline, lastSeen

  CrowdStrike CSV must have columns:
    id, hostname, osVersion, status, agentVersion

Examples:

  # Import both CSVs
  node coverage-cli.js import both logmein_export.csv crowdstrike_export.csv

  # See coverage summary
  node coverage-cli.js summary

  # See full report
  node coverage-cli.js report

  # Import just one system (updates the other)
  node coverage-cli.js import logmein updated_logmein.csv
  node coverage-cli.js summary
  `);
}

main();
