'use strict';
/**
 * CLI entry point for test account seeding.
 *
 * Usage:
 *   node scripts/seedTestUsers.js
 *   npm run seed
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { seedTestUsers } = require('../helpers/SeedHelper');

seedTestUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });
