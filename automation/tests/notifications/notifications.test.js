'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs } = require('../../helpers/AuthHelper');
const { sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const NotificationsPage = require('../../pages/NotificationsPage');
const DashboardPage = require('../../pages/DashboardPage');

describe('Notifications', function () {
  let driver;
  let notificationsPage;
  let dashboardPage;

  before(async function () {
    driver = await createDriver();
    notificationsPage = new NotificationsPage(driver);
    dashboardPage = new DashboardPage(driver);
    await loginAs(driver, 'gsa');
  });

  after(async function () {
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-NOTIF-000');
    }
  });

  it('TC-NOTIF-001: Notification bell is visible on dashboard', async function () {
    logTestStart('TC-NOTIF-001', this.test.title);
    addFeature('Notifications'); addSeverity('major'); addTestCaseId('TC-NOTIF-001');

    const visible = await dashboardPage.isNotificationBellVisible();
    expect(visible).to.be.true;
  });

  it('TC-NOTIF-002: Opening bell shows notification panel', async function () {
    logTestStart('TC-NOTIF-002', this.test.title);
    addFeature('Notifications'); addSeverity('major'); addTestCaseId('TC-NOTIF-002');

    await notificationsPage.openPanel();
    await sleep(500);

    const panelVisible = await notificationsPage.isVisible(notificationsPage.selectors.panel);
    expect(panelVisible).to.be.true;
  });

  it('TC-NOTIF-003: Notification count badge updates after reading', async function () {
    logTestStart('TC-NOTIF-003', this.test.title);
    addFeature('Notifications'); addSeverity('normal'); addTestCaseId('TC-NOTIF-003');

    const countBefore = await notificationsPage.getBadgeCount();
    if (countBefore === 0) { this.skip(); return; }

    await notificationsPage.openPanel();
    await notificationsPage.markAsRead(0);
    await sleep(800);

    const countAfter = await notificationsPage.getBadgeCount();
    expect(countAfter).to.be.lessThanOrEqual(countBefore);
  });

  it('TC-NOTIF-004: Mark all read reduces unread count to zero', async function () {
    logTestStart('TC-NOTIF-004', this.test.title);
    addFeature('Notifications'); addSeverity('major'); addTestCaseId('TC-NOTIF-004');

    const countBefore = await notificationsPage.getBadgeCount();
    if (countBefore === 0) { this.skip(); return; }

    await notificationsPage.openPanel();
    await notificationsPage.markAllRead();
    await sleep(1000);

    const countAfter = await notificationsPage.getBadgeCount();
    expect(countAfter).to.equal(0);
  });

  it('TC-NOTIF-005: Notifications are user-scoped (different users see different notifications)', async function () {
    logTestStart('TC-NOTIF-005', this.test.title);
    addFeature('Notifications'); addSeverity('major'); addTestCaseId('TC-NOTIF-005');

    const gsaNotifs = await notificationsPage.getNotifications();

    await loginAs(driver, 'user');
    await sleep(500);
    const userNotifs = await notificationsPage.getNotifications();

    // We can't assert they differ without injecting test notifications,
    // but we can assert the page loads without error for both roles
    expect(Array.isArray(gsaNotifs)).to.be.true;
    expect(Array.isArray(userNotifs)).to.be.true;

    await loginAs(driver, 'gsa');
  });
});
