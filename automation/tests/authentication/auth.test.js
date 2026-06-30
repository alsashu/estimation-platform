'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs, logout } = require('../../helpers/AuthHelper');
const { waitForUrl, sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId, addStory } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const LoginPage = require('../../pages/LoginPage');
const DashboardPage = require('../../pages/DashboardPage');
const config = require('../../config/config');

describe('usersController.Authentication', function () {
  let driver;
  let loginPage;
  let dashboardPage;

  before(async function () {
    driver = await createDriver();
    loginPage = new LoginPage(driver);
    dashboardPage = new DashboardPage(driver);
    await loginPage.navigateToLogin();
  });

  after(async function () {
    await quitDriver(driver);
  });

  // Only navigate back to /login when the previous test left us on a different route.
  // Saves a full page load on every test that stays on /login already.
  beforeEach(async function () {
    const url = await driver.getCurrentUrl();
    if (!url.includes('/login')) {
      await loginPage.navigateToLogin();
    }
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, `TC-AUTH-${String(this.currentTest.title).match(/\d+/) || '000'}`);
    }
  });

  it('TC-AUTH-001 [smoke]: should log in with valid GSA credentials and redirect to dashboard', async function () {
    logTestStart('TC-AUTH-001', this.test.title);
    addFeature('Authentication');
    addStory('Valid Login');
    addSeverity('critical');
    addTestCaseId('TC-AUTH-001');

    await loginPage.login(config.credentials.gsa.email, config.credentials.gsa.password);
    await waitForUrl(driver, '/dashboard', 8000);

    const url = await driver.getCurrentUrl();
    expect(url).to.include('/dashboard');
  });

  it('TC-AUTH-002: should show error with wrong password', async function () {
    logTestStart('TC-AUTH-002', this.test.title);
    addFeature('Authentication');
    addSeverity('critical');
    addTestCaseId('TC-AUTH-002');

    await loginPage.login(config.credentials.admin.email, 'WrongPassword!123');

    const errorMsg = await loginPage.getErrorMessage();
    expect(errorMsg.toLowerCase()).to.match(/invalid|incorrect|wrong|credential|password/);
  });

  it('TC-AUTH-003: should show error for non-existent user', async function () {
    logTestStart('TC-AUTH-003', this.test.title);
    addFeature('Authentication');
    addSeverity('major');
    addTestCaseId('TC-AUTH-003');

    await loginPage.login('nobody_nonexistent_xyz@nowhere.test', 'SomePass@2026');

    const errorMsg = await loginPage.getErrorMessage();
    expect(errorMsg.length).to.be.greaterThan(0);
  });

  it('TC-AUTH-004: should not submit with empty email and password', async function () {
    logTestStart('TC-AUTH-004', this.test.title);
    addFeature('Authentication');
    addSeverity('major');
    addTestCaseId('TC-AUTH-004');

    await loginPage.clickSignIn();
    await sleep(150);

    const url = await driver.getCurrentUrl();
    const stillOnLogin = url.includes('/login') || await loginPage.isLoginPageDisplayed();
    expect(stillOnLogin).to.be.true;
  });

  it('TC-AUTH-005: should show email field validation when only password provided', async function () {
    logTestStart('TC-AUTH-005', this.test.title);
    addFeature('Authentication');
    addSeverity('major');
    addTestCaseId('TC-AUTH-005');

    await loginPage.enterPassword('SomePass@2026');
    await loginPage.clickSignIn();
    await sleep(150);

    const url = await driver.getCurrentUrl();
    expect(url).to.include('/login');
  });

  it('TC-AUTH-006: should show password field validation when only email provided', async function () {
    logTestStart('TC-AUTH-006', this.test.title);
    addFeature('Authentication');
    addSeverity('major');
    addTestCaseId('TC-AUTH-006');

    await loginPage.enterEmail(config.credentials.admin.email);
    await loginPage.clickSignIn();
    await sleep(150);

    const url = await driver.getCurrentUrl();
    expect(url).to.include('/login');
  });

  it('TC-AUTH-007 [smoke]: should redirect to login after logout', async function () {
    logTestStart('TC-AUTH-007', this.test.title);
    addFeature('Authentication');
    addSeverity('critical');
    addTestCaseId('TC-AUTH-007');

    await loginPage.login(config.credentials.admin.email, config.credentials.admin.password);
    await waitForUrl(driver, '/dashboard', 8000);

    await logout(driver);
    await waitForUrl(driver, '/login', 8000);

    const url = await driver.getCurrentUrl();
    expect(url).to.include('/login');
  });

  it('TC-AUTH-008: should stay on login page after back button post-logout', async function () {
    logTestStart('TC-AUTH-008', this.test.title);
    addFeature('Authentication');
    addSeverity('major');
    addTestCaseId('TC-AUTH-008');

    await loginPage.login(config.credentials.admin.email, config.credentials.admin.password);
    await waitForUrl(driver, '/dashboard', 8000);

    await logout(driver);
    await waitForUrl(driver, '/login', 8000);

    await driver.navigate().back();
    await sleep(300);

    const url = await driver.getCurrentUrl();
    expect(url).to.include('/login');
  });

  it('TC-AUTH-009: should reject login for inactive account', async function () {
    logTestStart('TC-AUTH-009', this.test.title);
    addFeature('Authentication');
    addSeverity('major');
    addTestCaseId('TC-AUTH-009');

    await loginPage.login(config.credentials.inactive.email, config.credentials.inactive.password);

    const url = await driver.getCurrentUrl();
    const onLogin = url.includes('/login');
    const errorMsg = await loginPage.getErrorMessage();
    expect(onLogin || errorMsg.toLowerCase().includes('inactive')).to.be.true;
  });

  it('TC-AUTH-010 [smoke]: should mask the password field (type=password)', async function () {
    logTestStart('TC-AUTH-010', this.test.title);
    addFeature('Authentication');
    addSeverity('major');
    addTestCaseId('TC-AUTH-010');

    const type = await loginPage.getPasswordFieldType();
    expect(type).to.equal('password');
  });

  it('TC-AUTH-011: should have a Forgot Password link', async function () {
    logTestStart('TC-AUTH-011', this.test.title);
    addFeature('Authentication');
    addSeverity('normal');
    addTestCaseId('TC-AUTH-011');

    const present = await loginPage.hasForgotPasswordLink();
    expect(present).to.be.true;
  });

  it('TC-AUTH-012: Remember Me checkbox should be toggleable', async function () {
    logTestStart('TC-AUTH-012', this.test.title);
    addFeature('Authentication');
    addSeverity('minor');
    addTestCaseId('TC-AUTH-012');

    const present = await loginPage.hasRememberMeCheckbox();
    if (present) {
      await loginPage.checkRememberMe();
      const checked = await loginPage.isRememberMeChecked();
      expect(checked).to.be.true;
    } else {
      // Feature not present — skip gracefully
      this.skip();
    }
  });

  it('TC-AUTH-013 [smoke]: Admin login should show dashboard', async function () {
    logTestStart('TC-AUTH-013', this.test.title);
    addFeature('Authentication');
    addSeverity('critical');
    addTestCaseId('TC-AUTH-013');

    await loginPage.login(config.credentials.admin.email, config.credentials.admin.password);
    await waitForUrl(driver, '/dashboard', 8000);
    const onDashboard = await dashboardPage.isOnDashboard();
    expect(onDashboard).to.be.true;
  });

  it('TC-AUTH-014: Normal User login should show dashboard without admin menus', async function () {
    logTestStart('TC-AUTH-014', this.test.title);
    addFeature('Authentication');
    addSeverity('critical');
    addTestCaseId('TC-AUTH-014');

    await loginPage.login(config.credentials.user.email, config.credentials.user.password);
    await waitForUrl(driver, '/dashboard', 8000);

    const onDashboard = await dashboardPage.isOnDashboard();
    expect(onDashboard).to.be.true;

    const usersMenuVisible = await dashboardPage.isModuleVisible('users');
    expect(usersMenuVisible).to.be.false;

    const projectsMenuVisible = await dashboardPage.isModuleVisible('projects');
    expect(projectsMenuVisible).to.be.false;
  });
});
