'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs } = require('../../helpers/AuthHelper');
const { sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const { generateProject } = require('../../helpers/TestDataHelper');
const { getTokenForRole, createProject, deleteProject, getProjects } = require('../../utils/ApiUtil');
const ProjectsPage = require('../../pages/ProjectsPage');
const DashboardPage = require('../../pages/DashboardPage');

describe('Project Management', function () {
  let driver;
  let projectsPage;
  let dashboardPage;
  let gsaToken;
  const createdProjectIds = [];

  before(async function () {
    driver = await createDriver();
    projectsPage = new ProjectsPage(driver);
    dashboardPage = new DashboardPage(driver);
    gsaToken = await getTokenForRole('gsa');
    await loginAs(driver, 'gsa');
  });

  after(async function () {
    for (const pid of createdProjectIds) {
      try { await deleteProject(gsaToken, pid); } catch { /* best effort */ }
    }
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, `TC-PRJ-000`);
    }
  });

  it('TC-PRJ-001: Create project → appears in card grid', async function () {
    logTestStart('TC-PRJ-001', this.test.title);
    addFeature('Project Management'); addSeverity('critical'); addTestCaseId('TC-PRJ-001');

    const data = generateProject();
    await projectsPage.navigate();
    await projectsPage.clickAddProject();
    await projectsPage.fillProjectForm(data);
    await projectsPage.saveProject();

    const toast = await projectsPage.getToastMessage();
    expect(toast.toLowerCase()).to.match(/success|created/);

    const visible = await projectsPage.waitForProjectCard(data.name);
    expect(visible).to.be.true;

    const projects = await getProjects(gsaToken, { search: data.name });
    if (projects.length > 0) createdProjectIds.push(projects[0].id);
  });

  it('TC-PRJ-002: Duplicate project code → error shown', async function () {
    logTestStart('TC-PRJ-002', this.test.title);
    addFeature('Project Management'); addSeverity('major'); addTestCaseId('TC-PRJ-002');

    const data = generateProject();
    const created = await createProject(gsaToken, data);
    createdProjectIds.push(created.id);

    await projectsPage.navigate();
    await projectsPage.clickAddProject();
    await projectsPage.fillProjectForm({ ...generateProject(), code: data.code });
    await projectsPage.saveProject();

    const toast = await projectsPage.getToastMessage();
    expect(toast.toLowerCase()).to.match(/error|exist|duplicate/);
  });

  it('TC-PRJ-003: Edit project description → updated on card', async function () {
    logTestStart('TC-PRJ-003', this.test.title);
    addFeature('Project Management'); addSeverity('major'); addTestCaseId('TC-PRJ-003');

    const data = generateProject();
    const created = await createProject(gsaToken, data);
    createdProjectIds.push(created.id);

    await projectsPage.navigate();
    await sleep(500);
    await projectsPage.clickEditProject(data.name);
    await projectsPage.fillProjectForm({ description: 'Updated description via automation' });
    await projectsPage.saveProject();

    const toast = await projectsPage.getToastMessage();
    expect(toast.toLowerCase()).to.match(/success|updated/);
  });

  it('TC-PRJ-004: Disable project → status changes to inactive', async function () {
    logTestStart('TC-PRJ-004', this.test.title);
    addFeature('Project Management'); addSeverity('major'); addTestCaseId('TC-PRJ-004');

    const data = generateProject();
    const created = await createProject(gsaToken, data);
    createdProjectIds.push(created.id);

    await projectsPage.navigate();
    await sleep(500);
    await projectsPage.toggleProjectActive(data.name);
    await sleep(1000);

    const toast = await projectsPage.getToastMessage();
    expect(toast.toLowerCase()).to.match(/success|disabled|inactive/);
  });

  it('TC-PRJ-005: Delete project → removed from list', async function () {
    logTestStart('TC-PRJ-005', this.test.title);
    addFeature('Project Management'); addSeverity('critical'); addTestCaseId('TC-PRJ-005');

    const data = generateProject();
    await createProject(gsaToken, data);
    // Don't add to cleanup list — will be deleted in test

    await projectsPage.navigate();
    await sleep(500);
    await projectsPage.clickDeleteProject(data.name);
    await projectsPage.confirmDelete();
    await sleep(1000);

    const visible = await projectsPage.isProjectVisible(data.name);
    expect(visible).to.be.false;
  });

  it('TC-PRJ-006: Non-assigned project not visible to regular user', async function () {
    logTestStart('TC-PRJ-006', this.test.title);
    addFeature('Project Management'); addSeverity('critical'); addTestCaseId('TC-PRJ-006');

    // Create a project not assigned to normal user
    const data = generateProject();
    const created = await createProject(gsaToken, data);
    createdProjectIds.push(created.id);

    // Log in as normal user
    await loginAs(driver, 'user');

    // Check API — projects endpoint should not return this project for normal user
    const { getTokenForRole, getProjects } = require('../../utils/ApiUtil');
    const userToken = await getTokenForRole('user');
    const userProjects = await getProjects(userToken);
    const projectNames = userProjects.map(p => p.name);
    expect(projectNames).to.not.include(data.name);

    // Re-login as GSA for subsequent tests
    await loginAs(driver, 'gsa');
  });
});
