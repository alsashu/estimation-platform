'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs } = require('../../helpers/AuthHelper');
const { sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const { generateEstimation } = require('../../helpers/TestDataHelper');
const EstimationPage = require('../../pages/EstimationPage');

describe('Story Point Estimation', function () {
  let driver;
  let estimationPage;

  before(async function () {
    driver = await createDriver();
    estimationPage = new EstimationPage(driver);
    await loginAs(driver, 'user');
  });

  after(async function () {
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-STORY-000');
    }
  });

  it('TC-STORY-001: Submit valid story → points and hours calculated', async function () {
    logTestStart('TC-STORY-001', this.test.title);
    addFeature('Story Point Estimation'); addSeverity('critical'); addTestCaseId('TC-STORY-001');

    const data = generateEstimation();
    await estimationPage.navigate();
    await estimationPage.clickNewEstimation();
    await estimationPage.fillEstimationForm(data);
    await estimationPage.submitEstimation();

    const storyPoints = await estimationPage.getStoryPoints();
    const effortHours = await estimationPage.getEffortHours();

    expect(storyPoints).to.be.greaterThan(0);
    expect(effortHours).to.be.greaterThan(0);
  });

  it('TC-STORY-002: Empty title → validation error', async function () {
    logTestStart('TC-STORY-002', this.test.title);
    addFeature('Story Point Estimation'); addSeverity('major'); addTestCaseId('TC-STORY-002');

    await estimationPage.navigate();
    await estimationPage.clickNewEstimation();
    await estimationPage.fillEstimationForm({ ...generateEstimation(), title: '' });
    await estimationPage.submitEstimation();

    const errors = await estimationPage.getFormErrors();
    expect(errors.length).to.be.greaterThan(0);
  });

  it('TC-STORY-003: Different complexity values yield different story points', async function () {
    logTestStart('TC-STORY-003', this.test.title);
    addFeature('Story Point Estimation'); addSeverity('major'); addTestCaseId('TC-STORY-003');

    await estimationPage.navigate();

    // Low complexity
    await estimationPage.clickNewEstimation();
    await estimationPage.fillEstimationForm({ ...generateEstimation(), complexity: 'Low' });
    await estimationPage.submitEstimation();
    const lowPoints = await estimationPage.getStoryPoints();

    // High complexity
    await estimationPage.clickNewEstimation();
    await estimationPage.fillEstimationForm({ ...generateEstimation(), complexity: 'High' });
    await estimationPage.submitEstimation();
    const highPoints = await estimationPage.getStoryPoints();

    expect(highPoints).to.be.greaterThan(lowPoints);
  });

  it('TC-STORY-004: Saved estimation appears in history list', async function () {
    logTestStart('TC-STORY-004', this.test.title);
    addFeature('Story Point Estimation'); addSeverity('major'); addTestCaseId('TC-STORY-004');

    const data = generateEstimation();
    await estimationPage.navigate();
    await estimationPage.clickNewEstimation();
    await estimationPage.fillEstimationForm(data);
    await estimationPage.submitEstimation();

    await sleep(800);
    const inList = await estimationPage.isEstimationInList(data.title);
    expect(inList).to.be.true;
  });

  it('TC-STORY-005: Edit estimation → updates stored values', async function () {
    logTestStart('TC-STORY-005', this.test.title);
    addFeature('Story Point Estimation'); addSeverity('major'); addTestCaseId('TC-STORY-005');

    const data = generateEstimation();
    await estimationPage.navigate();
    await estimationPage.clickNewEstimation();
    await estimationPage.fillEstimationForm(data);
    await estimationPage.submitEstimation();
    await sleep(800);

    const updatedTitle = data.title + ' EDITED';
    await estimationPage.editEstimation(data.title, { title: updatedTitle });

    const toast = await estimationPage.getToastMessage();
    expect(toast.toLowerCase()).to.match(/success|updated/);

    const inList = await estimationPage.isEstimationInList(updatedTitle);
    expect(inList).to.be.true;
  });

  it('TC-STORY-006: Delete estimation → removed from list', async function () {
    logTestStart('TC-STORY-006', this.test.title);
    addFeature('Story Point Estimation'); addSeverity('major'); addTestCaseId('TC-STORY-006');

    const data = generateEstimation();
    await estimationPage.navigate();
    await estimationPage.clickNewEstimation();
    await estimationPage.fillEstimationForm(data);
    await estimationPage.submitEstimation();
    await sleep(800);

    await estimationPage.deleteEstimation(data.title);
    await sleep(800);

    const inList = await estimationPage.isEstimationInList(data.title);
    expect(inList).to.be.false;
  });
});
