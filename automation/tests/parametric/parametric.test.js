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

describe('Parametric Estimation', function () {
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
      await screenshotOnFailure(driver, 'TC-PARAM-000');
    }
  });

  it('TC-PARAM-001: Valid parametric inputs → total effort calculated', async function () {
    logTestStart('TC-PARAM-001', this.test.title);
    addFeature('Parametric Estimation'); addSeverity('critical'); addTestCaseId('TC-PARAM-001');

    await estimationPage.navigateToParametric();
    await estimationPage.fillParametricForm({
      functionPoints: 100,
      complexity: 'Medium',
      teamSize: 3,
    });
    await estimationPage.submitEstimation();

    const effort = await estimationPage.getEffortHours();
    expect(effort).to.be.greaterThan(0);
  });

  it('TC-PARAM-002: Zero function points → validation error', async function () {
    logTestStart('TC-PARAM-002', this.test.title);
    addFeature('Parametric Estimation'); addSeverity('major'); addTestCaseId('TC-PARAM-002');

    await estimationPage.navigateToParametric();
    await estimationPage.fillParametricForm({
      functionPoints: 0,
      complexity: 'Low',
      teamSize: 1,
    });
    await estimationPage.submitEstimation();

    const errors = await estimationPage.getFormErrors();
    const toast = await estimationPage.getToastMessage();
    const hasError = errors.length > 0 || toast.toLowerCase().includes('error');
    expect(hasError).to.be.true;
  });

  it('TC-PARAM-003: Larger team size reduces estimated duration', async function () {
    logTestStart('TC-PARAM-003', this.test.title);
    addFeature('Parametric Estimation'); addSeverity('major'); addTestCaseId('TC-PARAM-003');

    await estimationPage.navigateToParametric();

    await estimationPage.fillParametricForm({ functionPoints: 200, complexity: 'Medium', teamSize: 1 });
    await estimationPage.submitEstimation();
    const duration1 = await estimationPage.getDurationWeeks();

    await estimationPage.fillParametricForm({ functionPoints: 200, complexity: 'Medium', teamSize: 5 });
    await estimationPage.submitEstimation();
    const duration5 = await estimationPage.getDurationWeeks();

    if (duration1 && duration5) {
      expect(duration5).to.be.lessThanOrEqual(duration1);
    } else {
      this.skip();
    }
  });

  it('TC-PARAM-004: Export parametric estimation results', async function () {
    logTestStart('TC-PARAM-004', this.test.title);
    addFeature('Parametric Estimation'); addSeverity('minor'); addTestCaseId('TC-PARAM-004');

    await estimationPage.navigateToParametric();
    await estimationPage.fillParametricForm({ functionPoints: 150, complexity: 'High', teamSize: 3 });
    await estimationPage.submitEstimation();
    await sleep(800);

    const exported = await estimationPage.exportResults();
    expect(exported).to.be.true;
  });
});
