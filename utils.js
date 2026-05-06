/**
 * LogMeIn Central ETL - Utilities and Helpers
 */

const fs = require('fs');
const path = require('path');

/**
 * Logger class for structured logging
 */
class Logger {
  constructor(filePath = './logs/etl.log') {
    this.filePath = filePath;
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data,
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    
    // Console output
    console[level === 'ERROR' ? 'error' : 'log'](
      `[${timestamp}] [${level}] ${message}`,
      Object.keys(data).length > 0 ? data : ''
    );

    // File output
    fs.appendFileSync(this.filePath, logLine);
  }

  info(message, data) {
    this.log('INFO', message, data);
  }

  warn(message, data) {
    this.log('WARN', message, data);
  }

  error(message, data) {
    this.log('ERROR', message, data);
  }

  debug(message, data) {
    this.log('DEBUG', message, data);
  }

  getRecentLogs(lines = 50) {
    const content = fs.readFileSync(this.filePath, 'utf-8');
    return content.split('\n').slice(-lines).filter(Boolean);
  }
}

/**
 * Data validator class
 */
class DataValidator {
  /**
   * Validate device data
   */
  static validateDevice(device) {
    const errors = [];

    if (!device.id && !device.deviceId) {
      errors.push('Device must have an id or deviceId');
    }

    if (device.name && typeof device.name !== 'string') {
      errors.push('Device name must be a string');
    }

    if (device.isOnline !== undefined && typeof device.isOnline !== 'boolean') {
      errors.push('Device isOnline must be a boolean');
    }

    if (device.lastActivity && isNaN(Date.parse(device.lastActivity))) {
      errors.push('Device lastActivity must be a valid date');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate contact data
   */
  static validateContact(contact) {
    const errors = [];

    if (!contact.id && !contact.contactId) {
      errors.push('Contact must have an id or contactId');
    }

    if (contact.email && !this.isValidEmail(contact.email)) {
      errors.push('Contact email is invalid');
    }

    if (contact.phone && !this.isValidPhone(contact.phone)) {
      errors.push('Contact phone format is invalid');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate session data
   */
  static validateSession(session) {
    const errors = [];

    if (!session.id && !session.sessionId) {
      errors.push('Session must have an id or sessionId');
    }

    if (!session.startTime || isNaN(Date.parse(session.startTime))) {
      errors.push('Session must have a valid startTime');
    }

    if (session.endTime && isNaN(Date.parse(session.endTime))) {
      errors.push('Session endTime must be a valid date');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  static isValidPhone(phone) {
    // Basic international phone validation
    const re = /^\+?[\d\s\-().]{10,}$/;
    return re.test(phone);
  }
}

/**
 * Performance monitor
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {};
    this.startTimes = {};
  }

  start(label) {
    this.startTimes[label] = performance.now();
  }

  end(label) {
    if (!this.startTimes[label]) {
      throw new Error(`No start marker for ${label}`);
    }

    const duration = performance.now() - this.startTimes[label];
    
    if (!this.metrics[label]) {
      this.metrics[label] = [];
    }

    this.metrics[label].push(duration);
    delete this.startTimes[label];

    return duration;
  }

  getStats(label) {
    const measurements = this.metrics[label];
    
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      total: sum,
    };
  }

  printReport() {
    console.log('\n=== Performance Report ===\n');
    
    for (const [label, stats] of Object.entries(this.metrics)) {
      const timing = this.getStats(label);
      console.log(`${label}:`);
      console.log(`  Count: ${timing.count}`);
      console.log(`  Min: ${timing.min.toFixed(2)}ms`);
      console.log(`  Max: ${timing.max.toFixed(2)}ms`);
      console.log(`  Avg: ${timing.avg.toFixed(2)}ms`);
      console.log(`  Median: ${timing.median.toFixed(2)}ms`);
      console.log(`  P95: ${timing.p95.toFixed(2)}ms`);
      console.log(`  P99: ${timing.p99.toFixed(2)}ms`);
      console.log(`  Total: ${timing.total.toFixed(2)}ms\n`);
    }
  }
}

/**
 * Data transformation utilities
 */
class TransformationUtils {
  /**
   * Normalize string values
   */
  static normalizeString(value) {
    if (!value) return '';
    return value.toString().trim();
  }

  /**
   * Normalize email
   */
  static normalizeEmail(email) {
    return this.normalizeString(email).toLowerCase();
  }

  /**
   * Normalize phone number
   */
  static normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  /**
   * Parse ISO date string
   */
  static parseISODate(dateString) {
    if (!dateString) return null;
    try {
      return new Date(dateString);
    } catch {
      return null;
    }
  }

  /**
   * Convert seconds to human-readable duration
   */
  static secondsToDuration(seconds) {
    if (!seconds) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);

    return parts.length > 0 ? parts.join(' ') : '0s';
  }

  /**
   * Deduplicate array of objects
   */
  static deduplicate(array, key) {
    const seen = new Set();
    return array.filter(item => {
      const id = item[key];
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  /**
   * Group array by key
   */
  static groupBy(array, key) {
    return array.reduce((result, item) => {
      const group = item[key];
      if (!result[group]) result[group] = [];
      result[group].push(item);
      return result;
    }, {});
  }

  /**
   * Flatten nested objects
   */
  static flatten(obj, prefix = '') {
    const result = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}_${key}` : key;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(result, this.flatten(value, newKey));
        } else {
          result[newKey] = value;
        }
      }
    }

    return result;
  }
}

/**
 * Batch processor for large datasets
 */
class BatchProcessor {
  constructor(batchSize = 100) {
    this.batchSize = batchSize;
  }

  async process(items, processFn) {
    const results = [];
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const batchResults = await processFn(batch);
      results.push(...batchResults);
    }

    return results;
  }

  async processParallel(items, processFn, concurrency = 3) {
    const results = [];
    const batches = this.getBatches(items);

    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        concurrentBatches.map(batch => processFn(batch))
      );
      results.push(...batchResults.flat());
    }

    return results;
  }

  getBatches(items) {
    const batches = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }
    return batches;
  }
}

/**
 * Configuration manager
 */
class ConfigManager {
  constructor(envPath = '.env') {
    this.config = {};
    this.envPath = envPath;
    this.load();
  }

  load() {
    if (fs.existsSync(this.envPath)) {
      const content = fs.readFileSync(this.envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, value] = trimmed.split('=');
          if (key && value) {
            this.config[key.trim()] = value.trim();
          }
        }
      });
    }
  }

  get(key, defaultValue = undefined) {
    return this.config[key] || process.env[key] || defaultValue;
  }

  getAll() {
    return { ...this.config, ...process.env };
  }

  set(key, value) {
    this.config[key] = value;
  }

  save() {
    const lines = Object.entries(this.config)
      .map(([key, value]) => `${key}=${value}`);
    fs.writeFileSync(this.envPath, lines.join('\n'));
  }
}

/**
 * Health check utility
 */
class HealthChecker {
  constructor(etlInstance) {
    this.etl = etlInstance;
  }

  async checkAPIConnectivity() {
    try {
      // Make a simple API call to verify connectivity
      const response = await this.etl.client.get('/devices', { params: { limit: 1 } });
      return { healthy: true, status: 'API is accessible' };
    } catch (error) {
      return { 
        healthy: false, 
        status: `API is unavailable: ${error.message}` 
      };
    }
  }

  async checkDatabaseConnectivity() {
    try {
      await this.etl.query('SELECT 1');
      return { healthy: true, status: 'Database is accessible' };
    } catch (error) {
      return { 
        healthy: false, 
        status: `Database is unavailable: ${error.message}` 
      };
    }
  }

  async checkDatabaseSchema() {
    try {
      const tables = await this.etl.query(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      const requiredTables = ['devices', 'contacts', 'sessions', 'etl_logs'];
      const existingTables = tables.map(t => t.name);
      const missing = requiredTables.filter(t => !existingTables.includes(t));

      return {
        healthy: missing.length === 0,
        status: missing.length === 0 
          ? 'All tables exist'
          : `Missing tables: ${missing.join(', ')}`,
        tables: existingTables,
      };
    } catch (error) {
      return { 
        healthy: false, 
        status: `Schema check failed: ${error.message}` 
      };
    }
  }

  async checkDiskSpace() {
    const diskSpace = require('diskusage');
    try {
      const info = diskSpace.checkSync('/');
      const usagePercent = ((info.total - info.available) / info.total) * 100;
      
      return {
        healthy: usagePercent < 90,
        status: `Disk usage: ${usagePercent.toFixed(2)}%`,
        total: this.formatBytes(info.total),
        available: this.formatBytes(info.available),
      };
    } catch {
      return { 
        healthy: true, 
        status: 'Could not check disk space' 
      };
    }
  }

  async runAllChecks() {
    const results = {
      timestamp: new Date().toISOString(),
      checks: {},
      overall: true,
    };

    const checks = [
      { name: 'API Connectivity', fn: () => this.checkAPIConnectivity() },
      { name: 'Database Connectivity', fn: () => this.checkDatabaseConnectivity() },
      { name: 'Database Schema', fn: () => this.checkDatabaseSchema() },
      { name: 'Disk Space', fn: () => this.checkDiskSpace() },
    ];

    for (const check of checks) {
      try {
        results.checks[check.name] = await check.fn();
        if (!results.checks[check.name].healthy) {
          results.overall = false;
        }
      } catch (error) {
        results.checks[check.name] = {
          healthy: false,
          status: `Check failed: ${error.message}`,
        };
        results.overall = false;
      }
    }

    return results;
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  printHealthReport(results) {
    console.log('\n=== Health Check Report ===\n');
    console.log(`Timestamp: ${results.timestamp}`);
    console.log(`Overall Status: ${results.overall ? '✅ Healthy' : '❌ Unhealthy'}\n`);

    for (const [name, check] of Object.entries(results.checks)) {
      const status = check.healthy ? '✅' : '❌';
      console.log(`${status} ${name}: ${check.status}`);
      
      // Print additional details if available
      if (check.tables) {
        console.log(`  Tables: ${check.tables.join(', ')}`);
      }
      if (check.total) {
        console.log(`  Total: ${check.total} | Available: ${check.available}`);
      }
    }
  }
}

module.exports = {
  Logger,
  DataValidator,
  PerformanceMonitor,
  TransformationUtils,
  BatchProcessor,
  ConfigManager,
  HealthChecker,
};
