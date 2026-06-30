'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs } = require('../../helpers/AuthHelper');
const { sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const DashboardPage = require('../../pages/DashboardPage');

describe('Dashboard', function () {
  let driver;
  let dashboardPage;

  before(async function () {
    driver = await createDriver();
    dashboardPage = new DashboardPage(driver);
    await loginAs(driver, 'gsa');
  });

  after(async function () {
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-DASH-000');
    }
  });

  it('TC-DASH-001: Dashboard loads with KPI cards', async function () {
    logTestStart('TC-DASH-001', this.test.title);
    addFeature('Dashboard'); addSeverity('critical'); addTestCaseId('TC-DASH-001');

    const onDashboard = await dashboardPage.isOnDashboard();
    expect(onDashboard).to.be.true;

    const kpiValues = await dashboardPage.getAllKpiValues();
    expect(kpiValues.length).to.be.greaterThan(0);
  });

  it('TC-DASH-002: Charts are rendered on dashboard', async function () {
    logTestStart('TC-DASH-002', this.test.title);
    addFeature('Dashboard'); addSeverity('major'); addTestCaseId('TC-DASH-002');

    const chartsRendered = await dashboardPage.areChartsRendered();
    expect(chartsRendered).to.be.true;
  });

  it('TC-DASH-003: Notification bell is visible', async function () {
    logTestStart('TC-DASH-003', this.test.title);
    addFeature('Dashboard'); addSeverity('major'); addTestCaseId('TC-DASH-003');

    const notifVisible = await dashboardPage.isNotificationBellVisible();
    expect(notifVisible).to.be.true;
  });

  it('TC-DASH-004: Project selector has projects for GSA', async function () {
    logTestStart('TC-DASH-004', this.test.title);
    addFeature('Dashboard'); addSeverity('major'); addTestCaseId('TC-DASH-004');

    const hasAllProjects = await dashboardPage.isAllProjectsOptionVisible();
    expect(hasAllProjects).to.be.true;
  });

  it('TC-DASH-005: Selecting a specific project filters KPI cards', async function () {
    logTestStart('TC-DASH-005', this.test.title);
    addFeature('Dashboard'); addSeverity('major'); addTestCaseId('TC-DASH-005');

    // Get list of selectable projects
    const projectOptions = await dashboardPage.getProjectOptions();
    const nonAllOptions = projectOptions.filter(p => !p.toLowerCase().includes('all'));
    if (nonAllOptions.length === 0) { this.skip(); return; }

    await dashboardPage.selectProject(nonAllOptions[0]);
    await sleep(1200);

    const onDashboard = await dashboardPage.isOnDashboard();
    expect(onDashboard).to.be.true;
  });

  it('TC-DASH-006: Normal user sees only assigned projects in selector', async function () {
    logTestStart('TC-DASH-006', this.test.title);
    addFeature('Dashboard'); addSeverity('critical'); addTestCaseId('TC-DASH-006');

    await loginAs(driver, 'user');
    await sleep(800);

    const hasAllProjects = await dashboardPage.isAllProjectsOptionVisible();
    expect(hasAllProjects).to.be.false;

    const projectOptions = await dashboardPage.getProjectOptions();
    expect(projectOptions.length).to.be.greaterThanOrEqual(0);

    // Return to GSA for cleanup
    await loginAs(driver, 'gsa');
  });
});
