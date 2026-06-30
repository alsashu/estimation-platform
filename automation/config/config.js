'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const config = {
  baseUrl:    process.env.BASE_URL || 'http://localhost:5173',   // React/Vite frontend
  apiUrl:     process.env.API_URL  || 'http://localhost:4000',   // Express backend
  apiBaseUrl: process.env.API_URL  || 'http://localhost:4000',   // alias used by some test files
  browser: (process.env.BROWSER || 'chrome').toLowerCase(),
  // Explicit false check: anything other than the string 'true' is headed
  headless: process.env.HEADLESS === 'true',
  timeout: parseInt(process.env.TIMEOUT, 10) || 10000,
  implicitWait: parseInt(process.env.IMPLICIT_WAIT, 10) || 1000,
  pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT, 10) || 20000,
  // Milliseconds to pause after every UI action. 0 = no delay (production runs).
  slowMotion: Math.max(0, parseInt(process.env.SLOW_MOTION_MS, 10) || 0),
  screenshotOnFailure: process.env.SCREENSHOT_ON_FAILURE !== 'false',
  screenshotOnSuccess: process.env.SCREENSHOT_ON_SUCCESS === 'true',

  credentials: {
    superAdmin: {
      email: process.env.SUPER_ADMIN_EMAIL || 'ashu.joshi@mail.com',
      password: process.env.SUPER_ADMIN_PASSWORD || 'Ashu@123',
      role: 'Global Super Admin',
    },
    gsa: {
      email: process.env.GSA_EMAIL || 'gsa@example.com',
      password: process.env.GSA_PASSWORD || 'GSA@Admin2026',
      role: 'Global Super Admin',
    },
    ssa: {
      email: process.env.SSA_EMAIL || 'ssa@example.com',
      password: process.env.SSA_PASSWORD || 'SSA@Admin2026',
      role: 'Scoped Super Admin',
    },
    admin: {
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@2026',
      role: 'Admin',
    },
    user: {
      email: process.env.USER_EMAIL || 'user@example.com',
      password: process.env.USER_PASSWORD || 'User@2026',
      role: 'User',
    },
    inactive: {
      email: process.env.INACTIVE_EMAIL || 'inactive@example.com',
      password: process.env.INACTIVE_PASSWORD || 'Inactive@2026',
      role: 'User',
    },
  },

  paths: {
    screenshots: process.env.SCREENSHOTS_DIR || 'screenshots',
    logs: process.env.LOGS_DIR || 'logs',
    reports: process.env.REPORTS_DIR || 'reports',
    allureResults: process.env.ALLURE_RESULTS_DIR || 'allure-results',
    testData: 'testdata',
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'estimation_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
};

module.exports = config;
