'use strict';
/**
 * Parallel execution configuration — runs all suites with 3 concurrent workers.
 * Each test file gets its own worker thread and browser instance.
 * Target: 15-20 minutes for the full suite.
 * Usage:  npm run test:parallel
 *
 * Allure writes one UUID-named JSON file per test, so concurrent writes are safe.
 */
module.exports = {
  spec: 'tests/**/*.test.js',
  timeout: 20000,
  slow: 8000,
  reporter: 'allure-mocha',
  reporterOptions: {
    resultsDir: 'allure-results',
  },
  require: ['helpers/SetupHelper.js'],
  exit: true,
  parallel: true,
  jobs: 3,
};
