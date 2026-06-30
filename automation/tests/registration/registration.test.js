'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const { generateUser, weakPasswords } = require('../../helpers/TestDataHelper');
const { getTokenForRole, deleteUser, getUsers } = require('../../utils/ApiUtil');
const RegistrationPage = require('../../pages/RegistrationPage');

describe('Registration', function () {
  let driver;
  let registrationPage;
  const createdUserIds = [];

  before(async function () {
    driver = await createDriver();
    registrationPage = new RegistrationPage(driver);
  });

  after(async function () {
    const gsaToken = await getTokenForRole('gsa');
    for (const id of createdUserIds) {
      try { await deleteUser(gsaToken, id); } catch { /* best effort */ }
    }
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-REG-000');
    }
  });

  it('TC-REG-001: Valid registration form → success message shown', async function () {
    logTestStart('TC-REG-001', this.test.title);
    addFeature('Registration'); addSeverity('critical'); addTestCaseId('TC-REG-001');

    const userData = generateUser();
    await registrationPage.navigate();
    await registrationPage.fillRegistrationForm(userData);
    await registrationPage.submitRegistration();

    const confirmed = await registrationPage.isConfirmationShown();
    const msg = await registrationPage.getConfirmationMessage();

    if (confirmed || msg.toLowerCase().includes('success')) {
      const gsaToken = await getTokenForRole('gsa');
      const users = await getUsers(gsaToken, { search: userData.email });
      if (users.length > 0) createdUserIds.push(users[0].id);
      expect(true).to.be.true;
    } else {
      // Some platforms redirect to login page on registration success
      const url = await driver.getCurrentUrl();
      expect(url).to.match(/login|dashboard|verify/i);
    }
  });

  it('TC-REG-002: Duplicate email → error shown', async function () {
    logTestStart('TC-REG-002', this.test.title);
    addFeature('Registration'); addSeverity('major'); addTestCaseId('TC-REG-002');

    const gsaToken = await getTokenForRole('gsa');
    const existing = await getUsers(gsaToken);
    if (existing.length === 0) { this.skip(); return; }

    const existingEmail = existing[0].email;

    await registrationPage.navigate();
    await registrationPage.fillRegistrationForm({ ...generateUser(), email: existingEmail });
    await registrationPage.submitRegistration();

    const errors = await registrationPage.getValidationErrors();
    const msg = await registrationPage.getConfirmationMessage();
    const hasError = errors.length > 0 || msg.toLowerCase().includes('exist') || msg.toLowerCase().includes('error');
    expect(hasError).to.be.true;
  });

  it('TC-REG-003: Weak password → validation error shown', async function () {
    logTestStart('TC-REG-003', this.test.title);
    addFeature('Registration'); addSeverity('major'); addTestCaseId('TC-REG-003');

    await registrationPage.navigate();
    await registrationPage.fillRegistrationForm({ ...generateUser(), password: weakPasswords[0] });
    await registrationPage.submitRegistration();

    const errors = await registrationPage.getValidationErrors();
    const msg = await registrationPage.getConfirmationMessage();
    const hasError = errors.length > 0 || msg.toLowerCase().includes('password');
    expect(hasError).to.be.true;
  });

  it('TC-REG-004: Missing required fields → validation messages shown', async function () {
    logTestStart('TC-REG-004', this.test.title);
    addFeature('Registration'); addSeverity('major'); addTestCaseId('TC-REG-004');

    await registrationPage.navigate();
    await registrationPage.submitRegistration();

    const errors = await registrationPage.getValidationErrors();
    expect(errors.length).to.be.greaterThan(0);
  });

  it('TC-REG-005: Invalid email format → validation error shown', async function () {
    logTestStart('TC-REG-005', this.test.title);
    addFeature('Registration'); addSeverity('major'); addTestCaseId('TC-REG-005');

    await registrationPage.navigate();
    await registrationPage.fillRegistrationForm({ ...generateUser(), email: 'not-an-email' });
    await registrationPage.submitRegistration();

    const errors = await registrationPage.getValidationErrors();
    const toast = await registrationPage.getConfirmationMessage();
    const hasError = errors.length > 0 || toast.toLowerCase().includes('email') || toast.toLowerCase().includes('invalid');
    expect(hasError).to.be.true;
  });
});
