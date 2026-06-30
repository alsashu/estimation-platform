'use strict';
const { Builder } = require('selenium-webdriver');
const { getBrowserOptions } = require('../config/browsers');
const config = require('../config/config');
const { logger } = require('./LoggerUtil');

/**
 * Creates and returns a configured WebDriver instance.
 * @param {string} [browser] - override browser from config
 * @param {boolean} [headless] - override headless from config
 * @returns {Promise<WebDriver>}
 */
async function createDriver(browser, headless) {
  const browserName = browser || config.browser;
  const isHeadless = headless !== undefined ? headless : config.headless;

  logger.info(`Creating ${browserName} driver (headless=${isHeadless})`);

  const { browserName: resolvedBrowser, options } = getBrowserOptions(browserName, isHeadless);

  let builder = new Builder().forBrowser(resolvedBrowser);

  switch (browserName.toLowerCase()) {
    case 'chrome':
      builder = builder.setChromeOptions(options);
      break;
    case 'firefox':
      builder = builder.setFirefoxOptions(options);
      break;
    case 'edge':
      builder = builder.setEdgeOptions(options);
      break;
  }

  const driver = await builder.build();

  await driver.manage().setTimeouts({
    implicit: config.implicitWait,
    pageLoad: config.pageLoadTimeout,
    script: config.timeout,
  });

  // Maximise the window.
  // Chrome/Edge headed: --start-maximized already handles it, but calling
  // maximize() is harmless and acts as a fallback.
  // Firefox headed: no equivalent arg — maximize() is required.
  // Headless: skip maximize() — it has no effect in headless mode and can
  // emit a warning on some chromedriver versions.
  if (!isHeadless) {
    try {
      await driver.manage().window().maximize();
    } catch (e) {
      logger.debug(`window.maximize() skipped: ${e.message}`);
    }
  }

  logger.info(`Driver created successfully for ${browserName} (headless=${isHeadless}, slowMotion=${config.slowMotion}ms)`);
  return driver;
}

/**
 * Safely quits the WebDriver instance.
 * @param {WebDriver} driver
 */
async function quitDriver(driver) {
  if (driver) {
    try {
      await driver.quit();
      logger.info('Driver quit successfully');
    } catch (err) {
      logger.warn(`Error quitting driver: ${err.message}`);
    }
  }
}

module.exports = { createDriver, quitDriver };
