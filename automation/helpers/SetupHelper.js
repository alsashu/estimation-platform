'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { logger, logTestEnd } = require('../utils/LoggerUtil');
const { seedTestUsers } = require('./SeedHelper');

function ensureDirectories() {
  const dirs = [
    config.paths.screenshots,
    config.paths.logs,
    config.paths.reports,
    config.paths.allureResults,
  ];
  for (const dir of dirs) {
    const abs = path.resolve(__dirname, '..', dir);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(abs, { recursive: true });
      logger.debug(`Created directory: ${abs}`);
    }
  }
}

// Module-scoped timing store keyed by test full title.
const _timings = new Map();
const _suiteStart = Date.now();

/**
 * Mocha root hooks — exported so Mocha can pick them up via --require.
 */
const mochaHooks = {
  async beforeAll() {
    ensureDirectories();
    logger.info('====================================================');
    logger.info('  Estimation Platform — Selenium Automation Suite');
    logger.info(`  Browser    : ${config.browser}`);
    logger.info(`  Headless   : ${config.headless}`);
    logger.info(`  Base URL   : ${config.baseUrl}`);
    logger.info(`  Timeout    : ${config.timeout}ms`);
    logger.info(`  Slow Motion: ${config.slowMotion}ms`);
    logger.info('====================================================');

    // Ensure test accounts exist before any suite starts.
    // Non-fatal: individual suites will emit clear auth errors if seeding fails.
    try {
      await seedTestUsers();
    } catch (err) {
      logger.warn(`[seed] Skipped — ${err.message}`);
      logger.warn('[seed] Tests that require login will fail with auth errors.');
    }
  },

  beforeEach() {
    const test = this.currentTest;
    if (test) {
      _timings.set(test.fullTitle(), { start: Date.now() });
    }
  },

  afterEach() {
    const test = this.currentTest;
    if (!test) return;

    const key = test.fullTitle();
    const timing = _timings.get(key) || {};
    timing.duration = Date.now() - (timing.start || Date.now());
    timing.status = test.state || 'unknown';
    _timings.set(key, timing);

    const state = test.state || 'unknown';
    const title = test.fullTitle ? test.fullTitle() : test.title;
    logTestEnd(title, state, timing.duration);

    if (state === 'failed') {
      logger.error(`FAILED: ${title}`);
      if (test.err) {
        logger.error(`Error: ${test.err.message}`);
        if (test.err.stack) logger.debug(test.err.stack);
      }
    } else if (state === 'passed') {
      logger.info(`PASSED: ${title}`);
    } else {
      logger.warn(`${state.toUpperCase()}: ${title}`);
    }
  },

  afterAll() {
    const entries = [..._timings.entries()].filter(([, v]) => v.duration != null);
    const totalMs = Date.now() - _suiteStart;
    const passed = entries.filter(([, v]) => v.status === 'passed').length;
    const failed = entries.filter(([, v]) => v.status === 'failed').length;
    const skipped = entries.filter(([, v]) => v.status === 'pending').length;
    const testMs = entries.reduce((s, [, v]) => s + (v.duration || 0), 0);
    const avgMs = entries.length ? Math.round(testMs / entries.length) : 0;

    const slowest = [...entries].sort((a, b) => b[1].duration - a[1].duration).slice(0, 5);

    logger.info('====================================================');
    logger.info('  Execution Summary');
    logger.info('====================================================');
    logger.info(`  Total wall time  : ${(totalMs / 1000).toFixed(1)}s`);
    logger.info(`  Tests run        : ${entries.length}`);
    logger.info(`  Passed           : ${passed}`);
    logger.info(`  Failed           : ${failed}`);
    logger.info(`  Skipped/Pending  : ${skipped}`);
    logger.info(`  Average per test : ${(avgMs / 1000).toFixed(1)}s`);
    if (slowest.length) {
      logger.info('  Top 5 slowest:');
      slowest.forEach(([title, v]) => {
        logger.info(`    ${String(v.duration).padStart(6)}ms [${(v.status || '').padEnd(7)}] ${title}`);
      });
    }
    logger.info('====================================================');
  },
};

module.exports = { mochaHooks };
