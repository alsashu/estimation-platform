'use strict';
const { expect } = require('chai');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { loginAs } = require('../../helpers/AuthHelper');
const { sleep } = require('../../helpers/WaitHelper');
const { screenshotOnFailure } = require('../../utils/ScreenshotUtil');
const { addFeature, addSeverity, addTestCaseId, addStory } = require('../../helpers/ReportHelper');
const { logTestStart } = require('../../utils/LoggerUtil');
const { getTokenForRole, callGetExpectError, callPostExpectError, getUsers, getRoles, createUser, deleteUser } = require('../../utils/ApiUtil');
const { generateUser } = require('../../helpers/TestDataHelper');
const DashboardPage = require('../../pages/DashboardPage');
const UsersPage = require('../../pages/UsersPage');
const config = require('../../config/config');

describe('RBAC — Global Super Admin', function () {
  let driver;
  let dashboardPage;
  let usersPage;

  before(async function () {
    driver = await createDriver();
    dashboardPage = new DashboardPage(driver);
    usersPage = new UsersPage(driver);
    await loginAs(driver, 'gsa');
  });

  after(async function () {
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-RBAC-GSA');
    }
  });

  it('TC-RBAC-001: GSA can access all navigation items', async function () {
    logTestStart('TC-RBAC-001', this.test.title);
    addFeature('RBAC'); addStory('GSA Access'); addSeverity('critical'); addTestCaseId('TC-RBAC-001');

    const modules = ['users', 'projects', 'estimation', 'historical', 'analytics'];
    for (const mod of modules) {
      const visible = await dashboardPage.isModuleVisible(mod);
      expect(visible, `Module "${mod}" should be visible for GSA`).to.be.true;
    }
  });

  it('TC-RBAC-002: GSA project selector shows All Projects option', async function () {
    logTestStart('TC-RBAC-002', this.test.title);
    addFeature('RBAC'); addStory('GSA Project Scope'); addSeverity('critical'); addTestCaseId('TC-RBAC-002');

    const hasAllProjects = await dashboardPage.isAllProjectsOptionVisible();
    expect(hasAllProjects).to.be.true;
  });

  it('TC-RBAC-003: GSA can read user list via API', async function () {
    logTestStart('TC-RBAC-003', this.test.title);
    addFeature('RBAC'); addSeverity('major'); addTestCaseId('TC-RBAC-003');

    const token = await getTokenForRole('gsa');
    const result = await callGetExpectError('/api/users', token);
    expect(result.status).to.equal(200);
  });
});

describe('RBAC — Admin', function () {
  let driver;
  let dashboardPage;
  let usersPage;
  let gsaToken;
  let adminToken;
  const createdUserIds = [];

  before(async function () {
    driver = await createDriver();
    dashboardPage = new DashboardPage(driver);
    usersPage = new UsersPage(driver);
    gsaToken = await getTokenForRole('gsa');
    adminToken = await getTokenForRole('admin');
    await loginAs(driver, 'admin');
  });

  after(async function () {
    for (const uid of createdUserIds) {
      try { await deleteUser(gsaToken, uid); } catch { /* best effort */ }
    }
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-RBAC-ADMIN');
    }
  });

  it('TC-RBAC-004: Admin cannot see SA users in user list', async function () {
    logTestStart('TC-RBAC-004', this.test.title);
    addFeature('RBAC'); addStory('Admin Visibility'); addSeverity('critical'); addTestCaseId('TC-RBAC-004');

    const users = await getUsers(adminToken);
    const gsaUsers = users.filter(u =>
      (u.roles || []).some(r => r === 'Global Super Admin' || r === 'Scoped Super Admin' ||
        (typeof r === 'object' && (r.name === 'Global Super Admin' || r.name === 'Scoped Super Admin')))
    );
    expect(gsaUsers.length).to.equal(0);
  });

  it('TC-RBAC-005: Admin cannot modify a Super Admin user', async function () {
    logTestStart('TC-RBAC-005', this.test.title);
    addFeature('RBAC'); addSeverity('critical'); addTestCaseId('TC-RBAC-005');

    // Get GSA user by GSA token
    const gsaUsers = await getUsers(gsaToken);
    const saUser = gsaUsers.find(u =>
      (u.roles || []).some(r => r === 'Global Super Admin' || (typeof r === 'object' && r.name === 'Global Super Admin'))
    );
    if (!saUser) { this.skip(); return; }

    const result = await callPostExpectError(`/api/users/${saUser.id}`, { firstName: 'Hacked' }, adminToken);
    expect(result.status).to.be.oneOf([403, 404]);
  });

  it('TC-RBAC-006: Admin cannot assign SA role to a new user', async function () {
    logTestStart('TC-RBAC-006', this.test.title);
    addFeature('RBAC'); addSeverity('critical'); addTestCaseId('TC-RBAC-006');

    const roles = await getRoles(adminToken);
    const saRole = roles.find(r => r.name === 'Global Super Admin' || r.name === 'Scoped Super Admin');
    if (!saRole) { this.skip(); return; }

    const userData = generateUser();
    const result = await callPostExpectError('/api/users', { ...userData, roleIds: [saRole.id] }, adminToken);
    expect(result.status).to.equal(403);
  });

  it('TC-RBAC-007: Admin user list only shows own-created users', async function () {
    logTestStart('TC-RBAC-007', this.test.title);
    addFeature('RBAC'); addSeverity('critical'); addTestCaseId('TC-RBAC-007');

    // Create a user via GSA (different creator)
    const gsaCreated = await createUser(gsaToken, generateUser());
    createdUserIds.push(gsaCreated.id);

    const adminUsers = await getUsers(adminToken);
    const gsaCreatedInAdminList = adminUsers.find(u => u.id === gsaCreated.id);
    expect(gsaCreatedInAdminList).to.be.undefined;
  });

  it('TC-RBAC-008: Admin API call to PUT SA user returns 403', async function () {
    logTestStart('TC-RBAC-008', this.test.title);
    addFeature('RBAC'); addSeverity('critical'); addTestCaseId('TC-RBAC-008');

    const gsaUsers = await getUsers(gsaToken);
    const saUser = gsaUsers.find(u =>
      (u.roles || []).some(r => r === 'Global Super Admin' || (typeof r === 'object' && r.name === 'Global Super Admin'))
    );
    if (!saUser) { this.skip(); return; }

    const { callPut } = require('../../utils/ApiUtil');
    const result = await callPostExpectError(`/api/users/${saUser.id}`, { firstName: 'Tampered' }, adminToken);
    expect(result.status).to.equal(403);
  });
});

describe('RBAC — Normal User', function () {
  let driver;
  let dashboardPage;

  before(async function () {
    driver = await createDriver();
    dashboardPage = new DashboardPage(driver);
    await loginAs(driver, 'user');
  });

  after(async function () {
    await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await screenshotOnFailure(driver, 'TC-RBAC-USER');
    }
  });

  it('TC-RBAC-009: Normal user cannot see Users menu', async function () {
    logTestStart('TC-RBAC-009', this.test.title);
    addFeature('RBAC'); addStory('Normal User Restrictions'); addSeverity('critical'); addTestCaseId('TC-RBAC-009');

    const usersVisible = await dashboardPage.isModuleVisible('users');
    expect(usersVisible).to.be.false;
  });

  it('TC-RBAC-010: Normal user cannot see Projects menu', async function () {
    logTestStart('TC-RBAC-010', this.test.title);
    addFeature('RBAC'); addSeverity('critical'); addTestCaseId('TC-RBAC-010');

    const projectsVisible = await dashboardPage.isModuleVisible('projects');
    expect(projectsVisible).to.be.false;
  });

  it('TC-RBAC-011: Normal user cannot see Roles menu', async function () {
    logTestStart('TC-RBAC-011', this.test.title);
    addFeature('RBAC'); addSeverity('critical'); addTestCaseId('TC-RBAC-011');

    const rolesVisible = await dashboardPage.isModuleVisible('roles');
    expect(rolesVisible).to.be.false;
  });

  it('TC-RBAC-012: Normal user API call to GET /users returns 403', async function () {
    logTestStart('TC-RBAC-012', this.test.title);
    addFeature('RBAC'); addSeverity('critical'); addTestCaseId('TC-RBAC-012');

    const userToken = await getTokenForRole('user');
    const result = await callGetExpectError('/api/users', userToken);
    expect(result.status).to.be.oneOf([401, 403]);
  });

  it('TC-RBAC-013: Normal user All Projects option not shown in selector', async function () {
    logTestStart('TC-RBAC-013', this.test.title);
    addFeature('RBAC'); addSeverity('major'); addTestCaseId('TC-RBAC-013');

    const hasAllProjects = await dashboardPage.isAllProjectsOptionVisible();
    expect(hasAllProjects).to.be.false;
  });
});
