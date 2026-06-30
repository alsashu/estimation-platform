'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { logger } = require('./LoggerUtil');

const screenshotsBase = path.resolve(__dirname, '..', config.paths.screenshots);

/**
 * Take a screenshot and save it to a structured path.
 * @param {WebDriver} driver
 * @param {string} testId - test case ID e.g. 'TC-AUTH-001'
 * @param {string} [type='failure'] - 'failure' | 'success' | 'milestone'
 * @param {string} [label=''] - optional extra label
 * @returns {Promise<string>} absolute path of saved screenshot
 */
async function takeScreenshot(driver, testId, type = 'failure', label = '') {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const module = testId.split('-')[1] || 'general';
    const timestamp = Date.now();
    const safeName = label ? `_${label.replace(/[^a-z0-9]/gi, '_')}` : '';
    const filename = `${testId}_${type}${safeName}_${timestamp}.png`;
    const dir = path.join(screenshotsBase, module, date);

    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);

    const data = await driver.takeScreenshot();
    await fs.promises.writeFile(filePath, data, 'base64');

    logger.info(`Screenshot saved: ${filePath}`);
    return filePath;
  } catch (err) {
    logger.warn(`Failed to take screenshot: ${err.message}`);
    return null;
  }
}

/**
 * Capture a failure screenshot.
 */
async function screenshotOnFailure(driver, testId) {
  if (!config.screenshotOnFailure) return null;
  return takeScreenshot(driver, testId, 'failure');
}

/**
 * Capture a success / milestone screenshot.
 */
async function screenshotOnMilestone(driver, testId, label = 'milestone') {
  return takeScreenshot(driver, testId, 'milestone', label);
}

/**
 * Read a screenshot file as base64 (for Allure attachment).
 */
async function readScreenshotBase64(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const buf = await fs.promises.readFile(filePath);
  return buf.toString('base64');
}

module.exports = { takeScreenshot, screenshotOnFailure, screenshotOnMilestone, readScreenshotBase64 };
