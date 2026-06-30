'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

/**
 * allure-mocha 3.x configuration.
 * This file is auto-discovered by allure-mocha when it exists in the
 * project root alongside package.json.
 *
 * https://allurereport.org/docs/mocha/
 */
module.exports = {
  // Directory where allure-mocha writes raw result JSON files.
  resultsDir: process.env.ALLURE_RESULTS_DIR || 'allure-results',

  // Labels applied to every test in the suite.
  environmentInfo: {
    Browser:    process.env.BROWSER     || 'chrome',
    Headless:   process.env.HEADLESS    || 'false',
    BaseUrl:    process.env.BASE_URL    || 'http://localhost:5173',
    SlowMotion: `${process.env.SLOW_MOTION_MS || 0}ms`,
    NodeVersion: process.version,
  },
};
