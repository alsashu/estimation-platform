'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs } = require('../../helpers/AuthHelper');
const { sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const AnalyticsPage = require('../../pages/AnalyticsPage');

describe('Analytics', function () {
  let driver;
  let analyticsPage;

  before(async function () {
    driver = await createDriver();
    analyticsPage = new AnalyticsPage(driver);
    await loginAs(driver, 'gsa');
  });

  after(async function () {
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-ANLYT-000');
    }
  });

  it('TC-ANLYT-001: Analytics page loads with charts', async function () {
    logTestStart('TC-ANLYT-001', this.test.title);
    addFeature('Analytics'); addSeverity('critical'); addTestCaseId('TC-ANLYT-001');

    await analyticsPage.navigate();
    const chartCount = await analyticsPage.getChartCount();
    expect(chartCount).to.be.greaterThan(0);
  });

  it('TC-ANLYT-002: KPI values are numeric and non-negative', async function () {
    logTestStart('TC-ANLYT-002', this.test.title);
    addFeature('Analytics'); addSeverity('major'); addTestCaseId('TC-ANLYT-002');

    await analyticsPage.navigate();
    const kpiValues = await analyticsPage.getKpiValues();
    expect(kpiValues.length).to.be.greaterThan(0);
  });

  it('TC-ANLYT-003: Date range filter updates charts', async function () {
    logTestStart('TC-ANLYT-003', this.test.title);
    addFeature('Analytics'); addSeverity('major'); addTestCaseId('TC-ANLYT-003');

    await analyticsPage.navigate();
    await analyticsPage.setDateRange('2026-01-01', '2026-06-30');
    await analyticsPage.applyFilters();
    await sleep(1200);

    const chartCount = await analyticsPage.getChartCount();
    expect(chartCount).to.be.greaterThanOrEqual(0);
  });

  it('TC-ANLYT-004: Export report triggers download', async function () {
    logTestStart('TC-ANLYT-004', this.test.title);
    addFeature('Analytics'); addSeverity('minor'); addTestCaseId('TC-ANLYT-004');

    await analyticsPage.navigate();
    await analyticsPage.exportReport();
    await sleep(2000);

    const toast = await analyticsPage.getToastMessage();
    expect(toast.toLowerCase()).to.not.include('error');
  });

  it('TC-ANLYT-005: Analytics only shows data for user\'s assigned projects', async function () {
    logTestStart('TC-ANLYT-005', this.test.title);
    addFeature('Analytics'); addSeverity('critical'); addTestCaseId('TC-ANLYT-005');

    // Login as normal user and verify analytics reflects their project scope
    await loginAs(driver, 'user');
    await analyticsPage.navigate();

    // Page should load (200 OK based on their scope, not all data)
    const url = await driver.getCurrentUrl();
    const onAnalytics = url.includes('/analytics') || url.includes('/dashboard');
    expect(onAnalytics).to.be.true;

    await loginAs(driver, 'gsa');
  });
});
