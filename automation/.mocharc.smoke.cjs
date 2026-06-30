'use strict';
/**
 * Smoke test configuration — runs only tests tagged with [smoke].
 * Target: 5-10 minutes with parallel execution.
 * Usage:  npm run test:smoke
 */
module.exports = {
  spec: 'tests/**/*.test.js',
  timeout: 15000,
  slow: 5000,
  reporter: 'allure-mocha',
  reporterOptions: {
    resultsDir: 'allure-results',
  },
  require: ['helpers/SetupHelper.js'],
  exit: true,
  grep: '\\[smoke\\]',
  parallel: true,
  jobs: 3,
};
