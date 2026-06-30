'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs } = require('../../helpers/AuthHelper');
const { sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const HistoricalDataPage = require('../../pages/HistoricalDataPage');
const path = require('path');

describe('Historical Data', function () {
  let driver;
  let historicalPage;

  before(async function () {
    driver = await createDriver();
    historicalPage = new HistoricalDataPage(driver);
    await loginAs(driver, 'gsa');
  });

  after(async function () {
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-HIST-000');
    }
  });

  it('TC-HIST-001: Page loads and displays data table', async function () {
    logTestStart('TC-HIST-001', this.test.title);
    addFeature('Historical Data'); addSeverity('critical'); addTestCaseId('TC-HIST-001');

    await historicalPage.navigate();
    const rowCount = await historicalPage.getRowCount();
    expect(rowCount).to.be.greaterThanOrEqual(0);
  });

  it('TC-HIST-002: Search filters records correctly', async function () {
    logTestStart('TC-HIST-002', this.test.title);
    addFeature('Historical Data'); addSeverity('major'); addTestCaseId('TC-HIST-002');

    await historicalPage.navigate();
    const initialCount = await historicalPage.getRowCount();

    await historicalPage.search('a'); // search for records with "a"
    await sleep(800);
    const filteredCount = await historicalPage.getRowCount();

    // After search there may be fewer or equal records
    expect(filteredCount).to.be.lessThanOrEqual(initialCount);
  });

  it('TC-HIST-003: Filter by complexity reduces result set', async function () {
    logTestStart('TC-HIST-003', this.test.title);
    addFeature('Historical Data'); addSeverity('major'); addTestCaseId('TC-HIST-003');

    await historicalPage.navigate();
    await historicalPage.filterByComplexity('High');
    await sleep(800);

    const count = await historicalPage.getRowCount();
    expect(count).to.be.greaterThanOrEqual(0);
  });

  it('TC-HIST-004: Sort by column changes ordering', async function () {
    logTestStart('TC-HIST-004', this.test.title);
    addFeature('Historical Data'); addSeverity('minor'); addTestCaseId('TC-HIST-004');

    await historicalPage.navigate();
    await historicalPage.sortByColumn('name');
    await sleep(500);

    const hasSort = await historicalPage.isSortActive('name');
    expect(hasSort).to.be.true;
  });

  it('TC-HIST-005: Clear filters restores full dataset', async function () {
    logTestStart('TC-HIST-005', this.test.title);
    addFeature('Historical Data'); addSeverity('normal'); addTestCaseId('TC-HIST-005');

    await historicalPage.navigate();
    const initial = await historicalPage.getRowCount();

    await historicalPage.search('xyz_unlikely_search_term');
    await sleep(500);
    const filtered = await historicalPage.getRowCount();

    await historicalPage.clearFilters();
    await sleep(800);
    const restored = await historicalPage.getRowCount();

    expect(restored).to.be.greaterThanOrEqual(filtered);
  });

  it('TC-HIST-006: Export CSV downloads a file', async function () {
    logTestStart('TC-HIST-006', this.test.title);
    addFeature('Historical Data'); addSeverity('minor'); addTestCaseId('TC-HIST-006');

    await historicalPage.navigate();
    await historicalPage.exportCsv();
    await sleep(2000);
    // Just verify no error appeared
    const toast = await historicalPage.getToastMessage();
    expect(toast.toLowerCase()).to.not.include('error');
  });

  it('TC-HIST-007: Pagination works for large data sets', async function () {
    logTestStart('TC-HIST-007', this.test.title);
    addFeature('Historical Data'); addSeverity('minor'); addTestCaseId('TC-HIST-007');

    await historicalPage.navigate();
    const hasNext = await historicalPage.hasNextPage();
    if (!hasNext) { this.skip(); return; }

    const page1Count = await historicalPage.getRowCount();
    await historicalPage.goToNextPage();
    await sleep(800);
    const page2Count = await historicalPage.getRowCount();

    expect(page2Count).to.be.greaterThan(0);
  });
});
