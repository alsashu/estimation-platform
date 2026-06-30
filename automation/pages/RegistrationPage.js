'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { sleep, waitForElement } = require('../helpers/WaitHelper');

class RegistrationPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      firstNameInput: By.css('[data-testid="first-name"], input[name="firstName"]'),
      lastNameInput: By.css('[data-testid="last-name"], input[name="lastName"]'),
      usernameInput: By.css('[data-testid="username"], input[name="username"]'),
      emailInput: By.css('input[name="email"], input[type="email"]'),
      passwordInput: By.css('input[name="password"], input[type="password"]'),
      organizationInput: By.css('[data-testid="organization"], input[name="organization"]'),
      submitBtn: By.css('button[type="submit"]'),
      confirmationMessage: By.css('[data-testid="confirmation"], .success-message, [role="alert"].success'),
      validationErrors: By.css('.field-error, [data-testid="field-error"], [aria-invalid="true"]'),
      loginLink: By.css('[data-testid="login-link"], a[href*="login"]'),
    };
  }

  async navigate() {
    await super.navigate('/register');
    await this.waitForPageLoad();
  }

  async fillRegistrationForm(data) {
    if (data.firstName) await this.clearAndType(this.selectors.firstNameInput, data.firstName);
    if (data.lastName) await this.clearAndType(this.selectors.lastNameInput, data.lastName);
    if (data.username) await this.clearAndType(this.selectors.usernameInput, data.username);
    if (data.email) await this.clearAndType(this.selectors.emailInput, data.email);
    if (data.password) await this.clearAndType(this.selectors.passwordInput, data.password);
    if (data.organization) {
      try { await this.clearAndType(this.selectors.organizationInput, data.organization); }
      catch { /* field may not exist */ }
    }
  }

  async submitRegistration() {
    await this.click(this.selectors.submitBtn);
    await sleep(1500);
  }

  async getConfirmationMessage() {
    try {
      await waitForElement(this.driver, this.selectors.confirmationMessage, 8000);
      return this.getText(this.selectors.confirmationMessage);
    } catch {
      return this.getToastMessage();
    }
  }

  async getValidationErrors() {
    const errors = await this.driver.findElements(this.selectors.validationErrors);
    const msgs = [];
    for (const e of errors) {
      try { const t = await e.getText(); if (t) msgs.push(t); } catch { /* skip */ }
    }
    return msgs;
  }

  async isConfirmationShown() {
    return this.isVisible(this.selectors.confirmationMessage);
  }
}

module.exports = RegistrationPage;
