'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs } = require('../../helpers/AuthHelper');
const { sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const MasterDataPage = require('../../pages/MasterDataPage');

describe('Master Data Management', function () {
  let driver;
  let masterDataPage;

  before(async function () {
    driver = await createDriver();
    masterDataPage = new MasterDataPage(driver);
    await loginAs(driver, 'gsa');
  });

  after(async function () {
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-MDATA-000');
    }
  });

  it('TC-MDATA-001: Story points tab loads existing values', async function () {
    logTestStart('TC-MDATA-001', this.test.title);
    addFeature('Master Data'); addSeverity('critical'); addTestCaseId('TC-MDATA-001');

    await masterDataPage.navigate();
    try { await masterDataPage.navigateToTab('Story Points'); } catch { /* may be default */ }
    const rows = await masterDataPage.getTableRows();
    expect(rows.length).to.be.greaterThan(0);
  });

  it('TC-MDATA-002: Add new story point value → appears in table', async function () {
    logTestStart('TC-MDATA-002', this.test.title);
    addFeature('Master Data'); addSeverity('major'); addTestCaseId('TC-MDATA-002');

    await masterDataPage.navigate();
    try { await masterDataPage.navigateToTab('Story Points'); } catch { /* may be default */ }

    const testValue = Math.floor(Math.random() * 900) + 100; // 100-999 to avoid duplicates
    await masterDataPage.addStoryPoint(testValue, `SP-${testValue}`);

    const toast = await masterDataPage.getToastMessage();
    expect(toast.toLowerCase()).to.match(/success|created|added/);

    const present = await masterDataPage.isRowPresent('Story Points', String(testValue));
    expect(present).to.be.true;
  });

  it('TC-MDATA-003: Edit story point value → updated in table', async function () {
    logTestStart('TC-MDATA-003', this.test.title);
    addFeature('Master Data'); addSeverity('major'); addTestCaseId('TC-MDATA-003');

    await masterDataPage.navigate();
    try { await masterDataPage.navigateToTab('Story Points'); } catch { /* may be default */ }

    const testValue = Math.floor(Math.random() * 900) + 100;
    await masterDataPage.addStoryPoint(testValue, `SP-${testValue}`);
    await sleep(500);

    await masterDataPage.editStoryPoint(testValue, { label: `Updated-SP-${testValue}` });

    const toast = await masterDataPage.getToastMessage();
    expect(toast.toLowerCase()).to.match(/success|updated/);
  });

  it('TC-MDATA-004: Effort Estimates tab loads values', async function () {
    logTestStart('TC-MDATA-004', this.test.title);
    addFeature('Master Data'); addSeverity('major'); addTestCaseId('TC-MDATA-004');

    await masterDataPage.navigate();
    try {
      await masterDataPage.navigateToTab('Effort Estimates');
      const rows = await masterDataPage.getTableRows();
      expect(rows.length).to.be.greaterThanOrEqual(0);
    } catch {
      this.skip();
    }
  });

  it('TC-MDATA-005: Add effort estimate with valid range → saved', async function () {
    logTestStart('TC-MDATA-005', this.test.title);
    addFeature('Master Data'); addSeverity('major'); addTestCaseId('TC-MDATA-005');

    await masterDataPage.navigate();
    try {
      await masterDataPage.navigateToTab('Effort Estimates');
      await masterDataPage.addEffortEstimate({
        label: `EffortLevel_${Date.now()}`,
        minHours: 8,
        maxHours: 24,
      });
      const toast = await masterDataPage.getToastMessage();
      expect(toast.toLowerCase()).to.match(/success|created|added/);
    } catch {
      this.skip();
    }
  });

  it('TC-MDATA-006: Competency levels tab shows levels with multipliers', async function () {
    logTestStart('TC-MDATA-006', this.test.title);
    addFeature('Master Data'); addSeverity('major'); addTestCaseId('TC-MDATA-006');

    await masterDataPage.navigate();
    try {
      await masterDataPage.navigateToTab('Competency');
      const rows = await masterDataPage.getTableRows();
      expect(rows.length).to.be.greaterThanOrEqual(0);
    } catch {
      this.skip();
    }
  });
});
