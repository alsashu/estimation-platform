'use strict';
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const testDataDir = path.resolve(__dirname, '..', config.paths.testData);

/**
 * Generate a unique user payload.
 */
function generateUser(overrides = {}) {
  const ts = Date.now();
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  return {
    firstName,
    lastName,
    username: `user_${ts}_${faker.string.alphanumeric(4).toLowerCase()}`,
    email: `test_${ts}_${faker.string.alphanumeric(6).toLowerCase()}@automation.test`,
    password: 'Selenium@2026',
    roleIds: [],
    projectIds: [],
    ...overrides,
  };
}

/**
 * Generate a unique project payload.
 */
function generateProject(overrides = {}) {
  const ts = Date.now();
  return {
    name: `AutoProject_${ts}`,
    code: `AP${ts.toString().slice(-5)}`,
    description: faker.lorem.sentence(),
    status: 'active',
    ...overrides,
  };
}

/**
 * Generate an estimation payload.
 */
function generateEstimation(overrides = {}) {
  const complexities = ['Low', 'Medium', 'High', 'Very High'];
  const risks = ['Low', 'Medium', 'High'];
  return {
    storyName: `Story_${Date.now()}_${faker.lorem.words(2)}`,
    complexity: faker.helpers.arrayElement(complexities),
    risk: faker.helpers.arrayElement(risks),
    description: faker.lorem.sentence(),
    ...overrides,
  };
}

/**
 * Generate a registration payload.
 */
function generateRegistration(overrides = {}) {
  const ts = Date.now();
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    username: `reg_${ts}`,
    email: `reg_${ts}@automation.test`,
    password: 'Register@2026',
    organization: 'AutoOrg',
    ...overrides,
  };
}

/**
 * Return a unique email with timestamp suffix.
 */
function uniqueEmail() {
  return `test_${Date.now()}_${faker.string.alphanumeric(6).toLowerCase()}@automation.test`;
}

/**
 * Return a unique username with timestamp.
 */
function uniqueUsername() {
  return `user_${Date.now()}_${faker.string.alphanumeric(4).toLowerCase()}`;
}

/**
 * Load a JSON fixture file from testdata/.
 */
function loadFixture(filename) {
  const filePath = path.join(testDataDir, filename.endsWith('.json') ? filename : `${filename}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Passwords that fail the policy (for negative tests).
 */
const weakPasswords = [
  'password',       // no uppercase, no number, no special char
  'PASSWORD1',      // no lowercase, no special char
  'Pass1',          // too short
  'password123',    // no uppercase, no special char
  'Pass@word',      // no number
];

module.exports = {
  generateUser,
  generateProject,
  generateEstimation,
  generateRegistration,
  uniqueEmail,
  uniqueUsername,
  loadFixture,
  weakPasswords,
};
