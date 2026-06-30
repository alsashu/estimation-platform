'use strict';
module.exports = {
  spec: 'tests/**/*.test.js',
  timeout: 20000,
  slow: 8000,
  reporter: 'allure-mocha',
  // allure-mocha 3.x reads resultsDir from allure.config.js (project root).
  // The reporterOptions key is kept as a fallback for older versions.
  reporterOptions: {
    resultsDir: 'allure-results',
  },
  require: ['helpers/SetupHelper.js'],
  exit: true,
  // DO NOT set retries here — mocha retries cause allure to open a second
  // test lifecycle before the first is closed, resulting in UNKNOWN status
  // for every retried test.  Handle retries explicitly inside individual
  // tests when truly needed.
};
