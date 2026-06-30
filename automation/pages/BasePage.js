'use strict';
const { By, Key, until } = require('selenium-webdriver');
const { Select } = require('selenium-webdriver/lib/select');
const config = require('../config/config');
const { logger } = require('../utils/LoggerUtil');
const { takeScreenshot } = require('../utils/ScreenshotUtil');
const {
  waitForElement,
  waitForClickable,
  waitForInvisible,
  waitForPageLoad,
  waitForToast,
  sleep,
} = require('../helpers/WaitHelper');

class BasePage {
  constructor(driver) {
    this.driver = driver;
    this.baseUrl = config.baseUrl;
    // Milliseconds to pause after every UI action (0 = disabled).
    // Controlled by SLOW_MOTION_MS in .env — increase for demo / debugging.
    this._slowMotion = config.slowMotion || 0;
  }

  /**
   * Pause for slowMotion ms after a user-visible action.
   * No-op when SLOW_MOTION_MS=0 (default production setting).
   * @private
   */
  async _pace() {
    if (this._slowMotion > 0) await sleep(this._slowMotion);
  }

  /** Navigate to a path relative to baseUrl. */
  async navigate(pathStr = '') {
    const url = pathStr.startsWith('http') ? pathStr : `${this.baseUrl}${pathStr}`;
    logger.info(`navigate → ${url}`);
    await this.driver.get(url);
    await waitForPageLoad(this.driver);
    await this._pace();
  }

  /** Find element with optional wait. Retries on StaleElementReferenceException. */
  async findElement(locator, timeout = config.timeout) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.driver.wait(until.elementLocated(locator), timeout);
        return await this.driver.findElement(locator);
      } catch (err) {
        if (err.name === 'StaleElementReferenceError' && attempt < 3) {
          await sleep(300);
          continue;
        }
        throw err;
      }
    }
  }

  /** Find multiple elements. */
  async findElements(locator) {
    await this.driver.wait(until.elementLocated(locator), config.timeout).catch(() => {});
    return this.driver.findElements(locator);
  }

  /** Click an element (waits for clickable first). */
  async click(locator) {
    logger.info(`click: ${locator.toString()}`);
    const el = await waitForClickable(this.driver, locator);
    await el.click();
    await this._pace();
  }

  /** Clear a field and type text. */
  async type(locator, text) {
    logger.info(`type: ${locator.toString()} = "${text}"`);
    const el = await waitForElement(this.driver, locator);
    await el.clear();
    await el.sendKeys(text);
    await this._pace();
  }

  /** Clear, then type (alias with explicit clear via Ctrl+A). */
  async clearAndType(locator, text) {
    const el = await waitForElement(this.driver, locator);
    await el.click();
    await el.sendKeys(Key.chord(Key.CONTROL, 'a'));
    await el.sendKeys(Key.DELETE);
    await el.sendKeys(text);
    await this._pace();
  }

  /** Get visible text of element. */
  async getText(locator) {
    const el = await waitForElement(this.driver, locator);
    return el.getText();
  }

  /** Get value attribute of input. */
  async getValue(locator) {
    const el = await waitForElement(this.driver, locator);
    return el.getAttribute('value');
  }

  /** Check if element is visible (non-throwing). */
  async isVisible(locator) {
    try {
      const el = await this.driver.findElement(locator);
      return el.isDisplayed();
    } catch {
      return false;
    }
  }

  /** Check if element is present in DOM (non-throwing). */
  async isPresent(locator) {
    try {
      const els = await this.driver.findElements(locator);
      return els.length > 0;
    } catch {
      return false;
    }
  }

  /** Wait for element to be visible. */
  async waitFor(locator, timeout = config.timeout) {
    return waitForElement(this.driver, locator, timeout);
  }

  /** Wait for element to become invisible. */
  async waitForInvisible(locator, timeout = config.timeout) {
    return waitForInvisible(this.driver, locator, timeout);
  }

  /** Select dropdown option by visible text. */
  async selectByText(locator, text) {
    logger.info(`selectByText: ${locator.toString()} = "${text}"`);
    const el = await waitForElement(this.driver, locator);
    const select = new Select(el);
    await select.selectByVisibleText(text);
    await this._pace();
  }

  /** Scroll element into view. */
  async scrollIntoView(locator) {
    const el = await this.findElement(locator);
    await this.driver.executeScript('arguments[0].scrollIntoView({block:"center"})', el);
    await this._pace();
  }

  /** Hover over an element. */
  async hoverOver(locator) {
    const el = await this.findElement(locator);
    const actions = this.driver.actions({ async: true });
    await actions.move({ origin: el }).perform();
    await this._pace();
  }

  /** Get page title. */
  async getPageTitle() {
    return this.driver.getTitle();
  }

  /** Get current URL. */
  async getCurrentUrl() {
    return this.driver.getCurrentUrl();
  }

  /** Accept browser alert. */
  async acceptAlert() {
    await this.driver.wait(until.alertIsPresent(), 5000);
    const alert = await this.driver.switchTo().alert();
    await alert.accept();
  }

  /** Dismiss browser alert. */
  async dismissAlert() {
    await this.driver.wait(until.alertIsPresent(), 5000);
    const alert = await this.driver.switchTo().alert();
    await alert.dismiss();
  }

  /** Switch into an iframe. */
  async switchToFrame(locator) {
    const el = await this.findElement(locator);
    await this.driver.switchTo().frame(el);
  }

  /** Switch back to default content. */
  async switchToDefault() {
    await this.driver.switchTo().defaultContent();
  }

  /** Take a screenshot. Returns the file path. */
  async takeScreenshot(label = 'screenshot') {
    const testId = 'GENERAL';
    return takeScreenshot(this.driver, testId, 'milestone', label);
  }

  /**
   * Get the text of the most recent toast/alert notification.
   * Supports Sonner, Toastify, and generic [role="alert"] toasts.
   */
  async getToastMessage() {
    const selectors = [
      By.css('[data-sonner-toast] [data-title]'),
      By.css('[data-sonner-toast]'),
      By.css('.Toastify__toast-body'),
      By.css('[role="alert"]'),
      By.css('.toast-message'),
      By.css('[data-testid="toast-message"]'),
    ];
    for (const sel of selectors) {
      try {
        const el = await this.driver.findElement(sel);
        const text = await el.getText();
        if (text.trim()) return text.trim();
      } catch {
        // try next
      }
    }
    return '';
  }

  /** Wait for a toast of the given type to appear. */
  async waitForToast(type = 'success') {
    return waitForToast(this.driver, type);
  }

  /** Dismiss the current toast by pressing Escape or clicking close. */
  async dismissToast() {
    try {
      await this.driver.actions({ async: true }).sendKeys(Key.ESCAPE).perform();
    } catch {
      // ignore
    }
  }

  /** Send a key press to the active element. */
  async pressKey(key) {
    const active = await this.driver.switchTo().activeElement();
    await active.sendKeys(key);
    await this._pace();
  }

  /** Get an attribute value. */
  async getAttribute(locator, attr) {
    const el = await this.findElement(locator);
    return el.getAttribute(attr);
  }

  /** Execute JavaScript. */
  async executeScript(script, ...args) {
    return this.driver.executeScript(script, ...args);
  }

  /** Wait for document readyState complete. */
  async waitForPageLoad() {
    return waitForPageLoad(this.driver);
  }

  /** Check if a modal/dialog is open. */
  async isModalOpen() {
    const selectors = [
      By.css('[role="dialog"]'),
      By.css('.modal'),
      By.css('[data-testid="modal"]'),
    ];
    for (const sel of selectors) {
      if (await this.isVisible(sel)) return true;
    }
    return false;
  }

  /** Wait for a modal to appear. */
  async waitForModal() {
    for (const sel of [By.css('[role="dialog"]'), By.css('.modal'), By.css('[data-testid="modal"]')]) {
      try {
        await waitForElement(this.driver, sel, 5000);
        return;
      } catch { /* try next */ }
    }
  }

  /** Wait for a modal to close. */
  async waitForModalClose() {
    await sleep(500);
    await waitForInvisible(this.driver, By.css('[role="dialog"]'), 8000).catch(() => {});
  }
}

module.exports = BasePage;
