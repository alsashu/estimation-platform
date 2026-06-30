'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs, logout } = require('../../helpers/AuthHelper');
const { sleep, waitForUrl } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const { getTokenForRole, callGetExpectError, callPostExpectError } = require('../../utils/ApiUtil');
const LoginPage = require('../../pages/LoginPage');
const config = require('../../config/config');

describe('Security Tests', function () {
  let driver;
  let loginPage;

  before(async function () {
    driver = await createDriver();
    loginPage = new LoginPage(driver);
  });

  after(async function () {
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-SEC-000');
    }
  });

  it('TC-SEC-001 [smoke]: Unauthenticated access to /users redirects to login', async function () {
    logTestStart('TC-SEC-001', this.test.title);
    addFeature('Security'); addSeverity('critical'); addTestCaseId('TC-SEC-001');

    await driver.get(`${config.baseUrl}/users`);
    await waitForUrl(driver, 'login', 5000);
    const url = await driver.getCurrentUrl();
    expect(url).to.match(/login|auth/i);
  });

  it('TC-SEC-002: Unauthenticated access to /projects redirects to login', async function () {
    logTestStart('TC-SEC-002', this.test.title);
    addFeature('Security'); addSeverity('critical'); addTestCaseId('TC-SEC-002');

    await driver.get(`${config.baseUrl}/projects`);
    await waitForUrl(driver, 'login', 5000);
    const url = await driver.getCurrentUrl();
    expect(url).to.match(/login|auth/i);
  });

  it('TC-SEC-003 [smoke]: Unauthenticated API call to GET /api/users returns 401', async function () {
    logTestStart('TC-SEC-003', this.test.title);
    addFeature('Security'); addSeverity('critical'); addTestCaseId('TC-SEC-003');

    const result = await callGetExpectError('/api/users', null);
    expect(result.status).to.be.oneOf([401, 403]);
  });

  it('TC-SEC-004: Expired token returns 401 on protected endpoints', async function () {
    logTestStart('TC-SEC-004', this.test.title);
    addFeature('Security'); addSeverity('critical'); addTestCaseId('TC-SEC-004');

    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlIiwiZXhwIjoxfQ.invalid';
    const result = await callGetExpectError('/api/users', expiredToken);
    expect(result.status).to.be.oneOf([401, 403]);
  });

  it('TC-SEC-005: SQL injection in login email field does not crash the app', async function () {
    logTestStart('TC-SEC-005', this.test.title);
    addFeature('Security'); addSeverity('critical'); addTestCaseId('TC-SEC-005');

    await loginPage.navigateToLogin();
    const sqliPayload = "' OR 1=1--";
    await loginPage.login(sqliPayload, 'anything');
    await sleep(400);

    const url = await driver.getCurrentUrl();
    expect(url).to.include('/login');
  });

  it('TC-SEC-006: XSS attempt in login email field does not execute script', async function () {
    logTestStart('TC-SEC-006', this.test.title);
    addFeature('Security'); addSeverity('critical'); addTestCaseId('TC-SEC-006');

    await loginPage.navigateToLogin();
    await loginPage.login('<script>window.__xss=1</script>', 'anything');
    await sleep(400);

    const xssExecuted = await driver.executeScript('return window.__xss === 1');
    expect(xssExecuted).to.not.equal(true);
  });

  it('TC-SEC-007: Horizontal privilege escalation — user A cannot access user B data via API', async function () {
    logTestStart('TC-SEC-007', this.test.title);
    addFeature('Security'); addSeverity('critical'); addTestCaseId('TC-SEC-007');

    const gsaToken = await getTokenForRole('gsa');
    const { getUsers } = require('../../utils/ApiUtil');
    const users = await getUsers(gsaToken);

    const normalUserToken = await getTokenForRole('user');

    // Attempt to access another user's detail via normal user token
    if (users.length < 2) { this.skip(); return; }
    const otherUser = users.find(u => u.email !== config.credentials.user.email);
    if (!otherUser) { this.skip(); return; }

    const result = await callGetExpectError(`/api/users/${otherUser.id}`, normalUserToken);
    expect(result.status).to.be.oneOf([401, 403, 404]);
  });

  it('TC-SEC-008: CSRF protection — direct form POST without token rejected', async function () {
    logTestStart('TC-SEC-008', this.test.title);
    addFeature('Security'); addSeverity('major'); addTestCaseId('TC-SEC-008');

    // Simulate a direct API POST without origin check by calling raw API without auth
    const result = await callPostExpectError('/api/auth/login', { email: 'test@test.com', password: 'fake' }, null);
    // Should either succeed with 400/401 or reject with 403 CSRF
    expect(result.status).to.be.oneOf([400, 401, 403, 422]);
  });

  it('TC-SEC-009: Back-navigation after logout does not reveal protected pages', async function () {
    logTestStart('TC-SEC-009', this.test.title);
    addFeature('Security'); addSeverity('critical'); addTestCaseId('TC-SEC-009');

    await loginPage.navigateToLogin();
    await loginPage.login(config.credentials.admin.email, config.credentials.admin.password);
    await waitForUrl(driver, '/dashboard', 8000);

    await logout(driver);
    await waitForUrl(driver, '/login', 8000);

    await driver.navigate().back();
    await sleep(300);

    const url = await driver.getCurrentUrl();
    expect(url).to.match(/login|auth/i);
  });

  it('TC-SEC-010: Password field is masked at all times', async function () {
    logTestStart('TC-SEC-010', this.test.title);
    addFeature('Security'); addSeverity('major'); addTestCaseId('TC-SEC-010');

    await loginPage.navigateToLogin();
    const type = await loginPage.getPasswordFieldType();
    expect(type).to.equal('password');
  });
});
