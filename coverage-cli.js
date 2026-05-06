#!/usr/bin/env node

const CoverageETL = require('./coverage-etl');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

console.log(`[DEBUG] Command: ${command}, Args: ${args.join(', ')}`);

async function main() {
  const etl = new CoverageETL('./inventory.db');

  try {
    await etl.initialize();

    if (command === 'import') {
      await handleImport(etl, args);
    } else if (command === 'report') {
      await handleReport(etl);
    } else if (command === 'summary') {
      await handleSummary(etl);
    } else if (command === 'export') {
      await handleExport(etl, args);
    } else if (command === 'help' || !command) {
      showHelp();
    } else {
      console.error(`[ERROR] Unknown command: ${command}`);
      showHelp();
      process.exit(1);
    }

    etl.close();
  } catch (error) {
    console.error('[ERROR]', error.message);
    console.error(error.stack);
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

  console.table(report);

  const summary = await etl.getCoverageSummary();
  console.log('\n=== Coverage Summary ===');
  console.log(`Total Devices:        ${summary.total}`);
  console.log(`Full Coverage:        ${summary.fullCoverage} (${((summary.fullCoverage / summary.total) * 100).toFixed(1)}%)`);
  console.log(`LogMeIn Only:         ${summary.logmeinOnly}`);
  console.log(`CrowdStrike Only:     ${summary.crowdstrikeOnly}`);
}

async function handleSummary(etl) {
  const summary = await etl.getCoverageSummary();

  console.log('\n=== Coverage Summary ===\n');
  console.log(`Total Devices:        ${summary.total}`);
  console.log(`Full Coverage:        ${summary.fullCoverage} (${((summary.fullCoverage / summary.total) * 100).toFixed(1)}%)`);
  console.log(`LogMeIn Only:         ${summary.logmeinOnly}`);
  console.log(`CrowdStrike Only:     ${summary.crowdstrikeOnly}`);
  console.log('');
}

async function handleExport(etl, args) {
  console.log('[INFO] Export handler called');
  
  const exportType = args[1] ? args[1].toLowerCase() : 'both';
  const outputPath = args[2];

  console.log(`[INFO] Export type: ${exportType}, Output path: ${outputPath}`);
  console.log('[INFO] Exporting coverage data to CSV...\n');

  try {
    if (exportType === 'report' || exportType === 'both') {
      console.log('[INFO] Exporting report...');
      const reportFile = await etl.exportReportToCSV(outputPath ? `${outputPath}_report.csv` : null);
      console.log(`[OK] Full report: ${reportFile}`);
    }

    if (exportType === 'summary' || exportType === 'both') {
      console.log('[INFO] Exporting summary...');
      const summaryFile = await etl.exportSummaryToCSV(outputPath ? `${outputPath}_summary.csv` : null);
      console.log(`[OK] Summary report: ${summaryFile}`);
    }

    console.log('\n[OK] Export complete!');
  } catch (error) {
    console.error('[ERROR] Export failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

function showHelp() {
  console.log(`
Coverage ETL CLI - Track LogMeIn + CrowdStrike Device Coverage

Usage:
  node coverage-cli.js <command> [options]

Commands:

  import logmein <csvPath>
    Import LogMeIn devices from CSV file

  import crowdstrike <csvPath>
    Import CrowdStrike hosts from CSV file

  import both <logmeinCsv> <crowdstrikeCsv>
    Import from both systems at once

  report
    Show detailed coverage report for all devices

  summary
    Show coverage summary statistics

  export [type] [outputPath]
    Export coverage data to CSV
    Types: report, summary, both (default: both)
    Example: node coverage-cli.js export both coverage

  help
    Show this help message

Examples:

  node coverage-cli.js import both logmein.csv crowdstrike.csv
  node coverage-cli.js report
  node coverage-cli.js summary
  node coverage-cli.js export both coverage
  `);
}

main();
