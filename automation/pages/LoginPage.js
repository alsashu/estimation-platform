'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { waitForElement, waitForUrl } = require('../helpers/WaitHelper');

class LoginPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      emailInput: By.css('input[name="email"], input[type="email"], [data-testid="email-input"]'),
      passwordInput: By.css('input[name="password"], input[type="password"], [data-testid="password-input"]'),
      signInButton: By.css('button[type="submit"], [data-testid="signin-button"], button.btn-primary'),
      errorMessage: By.css('[data-testid="error-message"], .error-message, [role="alert"].error, .auth-error'),
      forgotPasswordLink: By.css('[data-testid="forgot-password"], a[href*="forgot"], a[href*="reset"]'),
      rememberMeCheckbox: By.css('input[type="checkbox"][name="rememberMe"], [data-testid="remember-me"]'),
      formHeading: By.css('h1, h2, [data-testid="login-heading"]'),
      loginForm: By.css('form, [data-testid="login-form"]'),
      validationMessage: By.css('.field-error, [data-testid="field-error"], .invalid-feedback, [aria-invalid]'),
    };
  }

  async navigateToLogin() {
    await this.navigate('/login');
    await this.waitForLoginPage();
  }

  async waitForLoginPage() {
    await waitForElement(this.driver, this.selectors.emailInput, 8000);
  }

  async isLoginPageDisplayed() {
    try {
      const url = await this.getCurrentUrl();
      const hasLoginPath = url.includes('/login');
      const emailVisible = await this.isVisible(this.selectors.emailInput);
      return hasLoginPath || emailVisible;
    } catch {
      return false;
    }
  }

  async enterEmail(email) {
    await this.clearAndType(this.selectors.emailInput, email);
  }

  async enterPassword(password) {
    await this.clearAndType(this.selectors.passwordInput, password);
  }

  async clickSignIn() {
    await this.click(this.selectors.signInButton);
  }

  async login(email, password) {
    await this.enterEmail(email);
    await this.enterPassword(password);
    await this.clickSignIn();
  }

  async getErrorMessage() {
    try {
      await waitForElement(this.driver, this.selectors.errorMessage, 5000);
      return this.getText(this.selectors.errorMessage);
    } catch {
      return this.getToastMessage();
    }
  }

  async clickForgotPassword() {
    await this.click(this.selectors.forgotPasswordLink);
  }

  async checkRememberMe() {
    await this.click(this.selectors.rememberMeCheckbox);
  }

  async isRememberMeChecked() {
    const el = await this.findElement(this.selectors.rememberMeCheckbox);
    return el.isSelected();
  }

  async getPasswordFieldType() {
    return this.getAttribute(this.selectors.passwordInput, 'type');
  }

  async isSignInButtonEnabled() {
    try {
      const el = await this.findElement(this.selectors.signInButton);
      return el.isEnabled();
    } catch {
      return false;
    }
  }

  async hasForgotPasswordLink() {
    return this.isPresent(this.selectors.forgotPasswordLink);
  }

  async hasRememberMeCheckbox() {
    return this.isPresent(this.selectors.rememberMeCheckbox);
  }
}

module.exports = LoginPage;
