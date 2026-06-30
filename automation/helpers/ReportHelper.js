'use strict';
const allure = require('allure-js-commons');
const fs = require('fs');
const { logger } = require('../utils/LoggerUtil');

/**
 * Add a generic label to the current Allure test.
 */
function addLabel(name, value) {
  try {
    allure.label(name, value);
  } catch (err) {
    logger.debug(`addLabel failed: ${err.message}`);
  }
}

/**
 * Set test severity.
 * @param {'blocker'|'critical'|'normal'|'minor'|'trivial'} severity
 */
function addSeverity(severity) {
  addLabel('severity', severity);
}

/**
 * Set test feature (maps to platform module).
 */
function addFeature(feature) {
  addLabel('feature', feature);
}

/**
 * Set test story within a feature.
 */
function addStory(story) {
  addLabel('story', story);
}

/**
 * Add the test case ID (e.g. 'TC-AUTH-001').
 */
function addTestCaseId(id) {
  addLabel('testCaseId', id);
  addLabel('AS_ID', id);
}

/**
 * Wrap a block in an Allure step.
 * @param {string} name
 * @param {Function} fn - async function
 */
async function addStep(name, fn) {
  logger.info(`  → ${name}`);
  try {
    return await allure.step(name, fn);
  } catch (err) {
    // allure.step may not be available; fall back to plain execution
    return fn();
  }
}

/**
 * Attach a screenshot file to the current Allure test.
 * @param {string} filePath - absolute path to the PNG
 * @param {string} [name='Screenshot']
 */
async function attachScreenshot(filePath, name = 'Screenshot') {
  try {
    if (!filePath || !fs.existsSync(filePath)) return;
    const data = fs.readFileSync(filePath);
    await allure.attachment(name, data, 'image/png');
  } catch (err) {
    logger.debug(`attachScreenshot failed: ${err.message}`);
  }
}

/**
 * Attach a plain text log to the current test.
 */
async function attachLog(content, name = 'Log') {
  try {
    await allure.attachment(name, content, 'text/plain');
  } catch (err) {
    logger.debug(`attachLog failed: ${err.message}`);
  }
}

module.exports = {
  addLabel,
  addSeverity,
  addFeature,
  addStory,
  addStep,
  addTestCaseId,
  attachScreenshot,
  attachLog,
};
