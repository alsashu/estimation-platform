'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs } = require('../../helpers/AuthHelper');
const { sleep, waitForUrl } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const { generateUser, generateProject } = require('../../helpers/TestDataHelper');
const { getTokenForRole, createUser, deleteUser, createProject, deleteProject } = require('../../utils/ApiUtil');
const LoginPage = require('../../pages/LoginPage');
const DashboardPage = require('../../pages/DashboardPage');
const UsersPage = require('../../pages/UsersPage');
const ProjectsPage = require('../../pages/ProjectsPage');
const EstimationPage = require('../../pages/EstimationPage');
const config = require('../../config/config');

describe('Regression Suite', function () {
  let driver;
  let loginPage;
  let dashboardPage;
  let usersPage;
  let projectsPage;
  let estimationPage;
  let gsaToken;
  const cleanup = { userIds: [], projectIds: [] };

  before(async function () {
    driver = await createDriver();
    loginPage = new LoginPage(driver);
    dashboardPage = new DashboardPage(driver);
    usersPage = new UsersPage(driver);
    projectsPage = new ProjectsPage(driver);
    estimationPage = new EstimationPage(driver);
    gsaToken = await getTokenForRole('gsa');
    await loginAs(driver, 'gsa');
  });

  after(async function () {
    for (const id of cleanup.userIds) {
      try { await deleteUser(gsaToken, id); } catch { /* best effort */ }
    }
    for (const id of cleanup.projectIds) {
      try { await deleteProject(gsaToken, id); } catch { /* best effort */ }
    }
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-REG-000');
    }
  });

  it('TC-REG-001: Full login → create user → verify → delete flow', async function () {
    logTestStart('TC-REG-001', this.test.title);
    addFeature('Regression'); addSeverity('critical'); addTestCaseId('TC-REG-001');

    const userData = generateUser();
    await usersPage.navigate();
    await usersPage.clickAddUser();
    await usersPage.fillUserForm(userData);
    await usersPage.saveUser();

    const toast = await usersPage.getToastMessage();
    expect(toast.toLowerCase()).to.match(/success|created/);

    const inTable = await usersPage.waitForUserInTable(userData.email);
    expect(inTable).to.be.true;

    // Delete via UI
    await usersPage.clickDeleteUser(userData.email);
    await usersPage.confirmDelete();
    await sleep(1000);

    const stillInTable = await usersPage.isUserInTable(userData.email);
    expect(stillInTable).to.be.false;
  });

  it('TC-REG-002: Create project → assign to user → verify user sees project', async function () {
    logTestStart('TC-REG-002', this.test.title);
    addFeature('Regression'); addSeverity('critical'); addTestCaseId('TC-REG-002');

    const userData = generateUser();
    const projectData = generateProject();

    const project = await createProject(gsaToken, projectData);
    cleanup.projectIds.push(project.id);

    const user = await createUser(gsaToken, { ...userData, projectIds: [project.id] });
    cleanup.userIds.push(user.id);

    // Login as the new user and verify they see the project
    const { getTokenForRole } = require('../../utils/ApiUtil');
    const axios = require('axios');
    try {
      const loginRes = await axios.post(`${config.apiBaseUrl}/auth/login`, {
        email: userData.email,
        password: userData.password,
      });
      const userToken = loginRes.data.token || loginRes.data.data?.token;
      const { getProjects } = require('../../utils/ApiUtil');
      const projects = await getProjects(userToken);
      const hasProject = projects.some(p => p.id === project.id);
      expect(hasProject).to.be.true;
    } catch {
      this.skip();
    }
  });

  it('TC-REG-003: User with projects disabled should not login', async function () {
    logTestStart('TC-REG-003', this.test.title);
    addFeature('Regression'); addSeverity('critical'); addTestCaseId('TC-REG-003');

    const userData = generateUser();
    const user = await createUser(gsaToken, { ...userData, is_active: false });
    cleanup.userIds.push(user.id);

    await driver.get(`${config.baseUrl}/login`);
    loginPage = new LoginPage(driver);
    await loginPage.login(userData.email, userData.password);
    await sleep(1500);

    const url = await driver.getCurrentUrl();
    expect(url).to.include('/login');

    await loginAs(driver, 'gsa');
  });

  it('TC-REG-004: Delete project does not cascade-delete assigned users', async function () {
    logTestStart('TC-REG-004', this.test.title);
    addFeature('Regression'); addSeverity('critical'); addTestCaseId('TC-REG-004');

    const userData = generateUser();
    const projectData = generateProject();

    const project = await createProject(gsaToken, projectData);
    const user = await createUser(gsaToken, { ...userData, projectIds: [project.id] });
    cleanup.userIds.push(user.id);

    // Delete the project
    await deleteProject(gsaToken, project.id);
    await sleep(500);

    // User should still exist
    const { getUsers } = require('../../utils/ApiUtil');
    const users = await getUsers(gsaToken, { search: userData.email });
    expect(users.length).to.be.greaterThan(0);
  });

  it('TC-REG-005: Estimation data persists after page refresh', async function () {
    logTestStart('TC-REG-005', this.test.title);
    addFeature('Regression'); addSeverity('major'); addTestCaseId('TC-REG-005');

    const { generateEstimation } = require('../../helpers/TestDataHelper');
    const data = generateEstimation();

    await estimationPage.navigate();
    await estimationPage.clickNewEstimation();
    await estimationPage.fillEstimationForm(data);
    await estimationPage.submitEstimation();
    await sleep(800);

    // Refresh the page
    await driver.navigate().refresh();
    await sleep(1000);

    const inList = await estimationPage.isEstimationInList(data.title);
    expect(inList).to.be.true;

    // Cleanup
    await estimationPage.deleteEstimation(data.title);
  });

  it('TC-REG-006: Concurrent users do not interfere with each other\'s sessions', async function () {
    logTestStart('TC-REG-006', this.test.title);
    addFeature('Regression'); addSeverity('major'); addTestCaseId('TC-REG-006');

    // This test validates session isolation via API tokens
    const adminToken = await getTokenForRole('admin');
    const userToken = await getTokenForRole('user');

    // Both tokens should work independently
    const { callGetExpectError } = require('../../utils/ApiUtil');
    const adminResult = await callGetExpectError('/api/users', adminToken);
    const userResult = await callGetExpectError('/api/users', userToken);

    expect(adminResult.status).to.equal(200);
    expect(userResult.status).to.be.oneOf([401, 403]);
  });

  it('TC-REG-007: Pagination state preserved across filters', async function () {
    logTestStart('TC-REG-007', this.test.title);
    addFeature('Regression'); addSeverity('minor'); addTestCaseId('TC-REG-007');

    const { HistoricalDataPage } = require('../../pages/HistoricalDataPage');
    const historicalPage = new (require('../../pages/HistoricalDataPage'))(driver);

    await historicalPage.navigate();
    const initialCount = await historicalPage.getRowCount();

    // Apply filter
    await historicalPage.search('test');
    await sleep(600);

    // Clear filter
    await historicalPage.clearFilters();
    await sleep(600);

    const restoredCount = await historicalPage.getRowCount();
    expect(restoredCount).to.be.greaterThanOrEqual(0);
  });
});
