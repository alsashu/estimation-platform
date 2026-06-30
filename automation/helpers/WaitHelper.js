'use strict';
const { until, By } = require('selenium-webdriver');
const config = require('../config/config');
const { logger } = require('../utils/LoggerUtil');

const DEFAULT_TIMEOUT = config.timeout;

/**
 * Wait until an element is visible.
 */
async function waitForElement(driver, locator, timeout = DEFAULT_TIMEOUT) {
  try {
    await driver.wait(until.elementIsVisible(await driver.findElement(locator)), timeout);
    return await driver.findElement(locator);
  } catch {
    await driver.wait(until.elementLocated(locator), timeout);
    const el = await driver.findElement(locator);
    await driver.wait(until.elementIsVisible(el), timeout);
    return el;
  }
}

/**
 * Wait until an element is clickable (visible + enabled).
 */
async function waitForClickable(driver, locator, timeout = DEFAULT_TIMEOUT) {
  await driver.wait(until.elementLocated(locator), timeout);
  const el = await driver.findElement(locator);
  await driver.wait(until.elementIsVisible(el), timeout);
  await driver.wait(until.elementIsEnabled(el), timeout);
  return el;
}

/**
 * Wait until element contains specific text.
 */
async function waitForText(driver, locator, text, timeout = DEFAULT_TIMEOUT) {
  await driver.wait(until.elementLocated(locator), timeout);
  const el = await driver.findElement(locator);
  await driver.wait(async () => {
    try {
      const t = await el.getText();
      return t.includes(text);
    } catch {
      return false;
    }
  }, timeout, `Timed out waiting for text "${text}"`);
  return el;
}

/**
 * Wait until URL contains a substring.
 */
async function waitForUrl(driver, urlPart, timeout = DEFAULT_TIMEOUT) {
  await driver.wait(until.urlContains(urlPart), timeout,
    `Timed out waiting for URL to contain "${urlPart}"`);
}

/**
 * Wait until element is invisible / gone.
 */
async function waitForInvisible(driver, locator, timeout = DEFAULT_TIMEOUT) {
  try {
    const el = await driver.findElement(locator);
    await driver.wait(until.elementIsNotVisible(el), timeout);
  } catch {
    // element not found = already gone, which is fine
  }
}

/**
 * Wait for a toast notification.
 * @param {WebDriver} driver
 * @param {string} [type='success'] - 'success' | 'error' | 'info' | 'warning'
 */
async function waitForToast(driver, type = 'success', timeout = 10000) {
  // Common toast selectors used by React toast libraries
  const selectors = [
    By.css('[role="alert"]'),
    By.css('.toast'),
    By.css('.Toastify__toast'),
    By.css('[data-testid="toast"]'),
    By.css('[data-sonner-toast]'),
    By.css('.sonner-toast'),
  ];

  for (const sel of selectors) {
    try {
      await driver.wait(until.elementLocated(sel), 3000);
      const el = await driver.findElement(sel);
      await driver.wait(until.elementIsVisible(el), 3000);
      return el;
    } catch {
      // Try next selector
    }
  }

  // Fallback — wait for any visible alert-role element
  await driver.wait(until.elementLocated(By.css('[role="alert"]')), timeout);
  return driver.findElement(By.css('[role="alert"]'));
}

/**
 * Simple promise-based sleep.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for document ready state to be complete.
 */
async function waitForPageLoad(driver, timeout = DEFAULT_TIMEOUT) {
  await driver.wait(
    async () => {
      const state = await driver.executeScript('return document.readyState');
      return state === 'complete';
    },
    timeout,
    'Page did not finish loading'
  );
}

/**
 * Retry clicking an element on StaleElementReferenceException.
 */
async function retryClick(driver, locator, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const el = await waitForClickable(driver, locator);
      await el.click();
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      logger.debug(`retryClick attempt ${attempt} failed: ${err.message}`);
      await sleep(500);
    }
  }
}

/**
 * Wait until an element has a non-empty text value.
 */
async function waitForNonEmptyText(driver, locator, timeout = DEFAULT_TIMEOUT) {
  await driver.wait(until.elementLocated(locator), timeout);
  const el = await driver.findElement(locator);
  await driver.wait(async () => {
    try {
      const t = await el.getText();
      return t.trim().length > 0;
    } catch {
      return false;
    }
  }, timeout);
  return el;
}

module.exports = {
  waitForElement,
  waitForClickable,
  waitForText,
  waitForUrl,
  waitForInvisible,
  waitForToast,
  sleep,
  waitForPageLoad,
  retryClick,
  waitForNonEmptyText,
};
