'use strict';
const { By } = require('selenium-webdriver');
const config = require('../config/config');
const { waitForUrl, waitForElement, sleep } = require('./WaitHelper');
const { logger } = require('../utils/LoggerUtil');
const ApiUtil = require('../utils/ApiUtil');

/**
 * Log in via the UI.
 * @param {WebDriver} driver
 * @param {string} email
 * @param {string} password
 */
async function login(driver, email, password) {
  logger.info(`AuthHelper.login: ${email}`);
  await driver.get(`${config.baseUrl}/login`);

  const emailInput = await waitForElement(driver, By.css('input[name="email"], input[type="email"], [data-testid="email-input"]'));
  await emailInput.clear();
  await emailInput.sendKeys(email);

  const pwInput = await waitForElement(driver, By.css('input[name="password"], input[type="password"], [data-testid="password-input"]'));
  await pwInput.clear();
  await pwInput.sendKeys(password);

  const signInBtn = await waitForElement(driver, By.css('button[type="submit"], [data-testid="signin-button"], button.btn-primary'));
  await signInBtn.click();
}

/**
 * Log in and wait for authenticated state (dashboard URL).
 */
async function loginAndWait(driver, email, password) {
  await login(driver, email, password);
  await waitForAuthenticatedState(driver);
}

/**
 * Log in as a named role using config credentials.
 * @param {WebDriver} driver
 * @param {'gsa'|'ssa'|'admin'|'user'} role
 */
async function loginAs(driver, role) {
  const creds = config.credentials[role];
  if (!creds) throw new Error(`Unknown role: ${role}`);
  logger.info(`AuthHelper.loginAs: ${role} (${creds.email})`);
  await loginAndWait(driver, creds.email, creds.password);
}

/**
 * Log out via the UI.
 */
async function logout(driver) {
  logger.info('AuthHelper.logout');
  try {
    // Try user menu / avatar first
    const userMenuSelectors = [
      By.css('[data-testid="user-menu"]'),
      By.css('[data-testid="user-avatar"]'),
      By.css('.user-menu-trigger'),
      By.css('[aria-label="User menu"]'),
      By.css('button.user-dropdown'),
    ];

    for (const sel of userMenuSelectors) {
      try {
        const el = await driver.findElement(sel);
        await el.click();
        await sleep(400);
        break;
      } catch {
        // Try next
      }
    }

    // Click the logout option
    const logoutSelectors = [
      By.css('[data-testid="logout-button"]'),
      By.css('[data-testid="logout"]'),
      By.xpath('//*[contains(text(), "Logout") or contains(text(), "Sign Out") or contains(text(), "Log Out")]'),
      By.css('button.logout'),
    ];

    for (const sel of logoutSelectors) {
      try {
        const el = await driver.findElement(sel);
        await el.click();
        break;
      } catch {
        // Try next
      }
    }

    await waitForUrl(driver, '/login', 10000);
    logger.info('Logout successful');
  } catch (err) {
    logger.warn(`Logout via UI failed: ${err.message} — navigating to /login`);
    await driver.get(`${config.baseUrl}/login`);
  }
}

/**
 * Wait until the app is in authenticated state (on dashboard route).
 */
async function waitForAuthenticatedState(driver, timeout = 8000) {
  try {
    await waitForUrl(driver, '/dashboard', timeout);
  } catch {
    // Some apps redirect to / or /home — also acceptable
    const url = await driver.getCurrentUrl();
    if (url.includes('/login')) {
      throw new Error('Authentication failed — still on login page');
    }
  }
}

/**
 * Obtain an API access token for the named role via direct API call.
 */
async function getApiToken(role) {
  const creds = config.credentials[role];
  if (!creds) throw new Error(`Unknown role: ${role}`);
  const result = await ApiUtil.login(creds.email, creds.password);
  return result.accessToken;
}

module.exports = { login, loginAndWait, loginAs, logout, waitForAuthenticatedState, getApiToken };
