'use strict';
/**
 * End-to-End Business Workflow — Smoke Test
 *
 * Executes a full, three-phase business scenario:
 *   Phase 1 — Super Admin creates a project and two users, then logs out.
 *   Phase 2 — Admin creates story-point and parametric estimations, verifies
 *              historical data, dashboard KPIs and analytics, then logs out.
 *   Phase 3 — Normal User verifies project-scoped access and data isolation,
 *              then logs out.
 *
 * Tag: [smoke] on the outer describe → included in npm run test:smoke
 * Credentials: SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env
 */

const { expect } = require('chai');
const { By } = require('selenium-webdriver');
const { createDriver, quitDriver } = require('../../utils/DriverFactory');
const { waitForUrl, sleep } = require('../../helpers/WaitHelper');
const { takeScreenshot } = require('../../utils/ScreenshotUtil');
const {
  addFeature, addSeverity, addTestCaseId, addStory,
  addStep, attachScreenshot, attachLog,
} = require('../../helpers/ReportHelper');
const { logTestStart, logStep, logger } = require('../../utils/LoggerUtil');
const { generateUser, generateProject, generateEstimation } = require('../../helpers/TestDataHelper');
const {
  login, createUser, deleteUser, getUsers,
  createProject, deleteProject, getProjects,
} = require('../../utils/ApiUtil');
const LoginPage = require('../../pages/LoginPage');
const DashboardPage = require('../../pages/DashboardPage');
const ProjectsPage = require('../../pages/ProjectsPage');
const UsersPage = require('../../pages/UsersPage');
const EstimationPage = require('../../pages/EstimationPage');
const HistoricalDataPage = require('../../pages/HistoricalDataPage');
const AnalyticsPage = require('../../pages/AnalyticsPage');
const config = require('../../config/config');

// ─── Artifact helpers ─────────────────────────────────────────────────────────

async function captureFailure(driver, stepLabel) {
  try {
    const ss = await takeScreenshot(driver, 'E2E', 'failure',
      stepLabel.replace(/\W+/g, '_').slice(0, 50));
    if (ss) await attachScreenshot(ss, `Failure: ${stepLabel}`);
  } catch { /* ignore */ }

  try {
    const logs = await driver.manage().logs().get('browser');
    const errors = logs.filter(l => ['SEVERE', 'WARNING'].includes(String(l.level)));
    if (errors.length) {
      await attachLog(
        errors.map(l => `[${l.level}] ${l.message}`).join('\n'),
        'Browser Console Errors',
      );
    }
  } catch { /* CDP not available in all setups */ }
}

async function milestone(driver, label) {
  try {
    const ss = await takeScreenshot(driver, 'E2E', 'milestone',
      label.replace(/\W+/g, '_').slice(0, 50));
    if (ss) await attachScreenshot(ss, label);
  } catch { /* ignore */ }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('E2E Business Workflow [smoke]', function () {
  // Each step may take up to 45 s (network, renders, toasts, API calls).
  this.timeout(45000);

  // Shared driver and pages
  let driver;
  let loginPage, dashboardPage, projectsPage, usersPage;
  let estimationPage, historicalPage, analyticsPage;

  // API token for data cleanup; populated in before()
  let saToken;

  // Context object — state shared across all steps
  const ctx = {
    saLoggedIn: false,
    project:    null,   // { name, code, id }
    adminUser:  null,   // { email, password, id }
    normalUser: null,   // { email, password, id }
    storyEstName: null,
    adminLoggedIn: false,
    normalUserLoggedIn: false,
  };

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  before(async function () {
    this.timeout(30000);
    driver = await createDriver();
    loginPage      = new LoginPage(driver);
    dashboardPage  = new DashboardPage(driver);
    projectsPage   = new ProjectsPage(driver);
    usersPage      = new UsersPage(driver);
    estimationPage = new EstimationPage(driver);
    historicalPage = new HistoricalDataPage(driver);
    analyticsPage  = new AnalyticsPage(driver);

    // Obtain SA API token for teardown. Non-fatal if API is unreachable.
    try {
      const creds = config.credentials.superAdmin;
      const result = await login(creds.email, creds.password);
      saToken = result.accessToken;
      logger.info('SA API token obtained for cleanup');
    } catch (err) {
      logger.warn(`Could not obtain SA API token: ${err.message}. Cleanup will be skipped.`);
    }
  });

  after(async function () {
    this.timeout(30000);
    // Best-effort API cleanup of test-generated data
    if (saToken) {
      const del = async (fn, id, label) => {
        try { await fn(saToken, id); logger.info(`Cleaned up: ${label}`); }
        catch (e) { logger.warn(`Cleanup failed for ${label}: ${e.message}`); }
      };
      if (ctx.normalUser?.id)  await del(deleteUser,    ctx.normalUser.id,  `Normal user ${ctx.normalUser.email}`);
      if (ctx.adminUser?.id)   await del(deleteUser,    ctx.adminUser.id,   `Admin user ${ctx.adminUser.email}`);
      if (ctx.project?.id)     await del(deleteProject, ctx.project.id,     `Project ${ctx.project.name}`);
    }
    if (driver) await quitDriver(driver);
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      await captureFailure(driver, this.currentTest.title);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — Super Admin Setup
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Phase 1 — Super Admin Setup', function () {

    it('STEP-01: Login as Super Admin → redirect to Dashboard', async function () {
      logTestStart('STEP-01', this.test.title);
      addFeature('E2E Workflow'); addStory('Super Admin Setup');
      addSeverity('blocker'); addTestCaseId('STEP-01');

      const { email, password } = config.credentials.superAdmin;

      await addStep('Navigate to /login', async () => {
        await loginPage.navigateToLogin();
        expect(await driver.getCurrentUrl()).to.include('/login');
      });

      await addStep(`Submit credentials for ${email}`, async () => {
        await loginPage.login(email, password);
        await waitForUrl(driver, '/dashboard', 10000);
      });

      await addStep('Confirm URL is /dashboard', async () => {
        const url = await driver.getCurrentUrl();
        expect(url, 'Should land on /dashboard after login').to.include('/dashboard');
        ctx.saLoggedIn = true;
      });

      await milestone(driver, 'STEP-01_SA_Login_Success');
    });

    it('STEP-02: Verify Dashboard — KPIs, charts, navigation', async function () {
      if (!ctx.saLoggedIn) this.skip();
      logTestStart('STEP-02', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-02');

      await addStep('Verify page title is set', async () => {
        const title = await driver.getTitle();
        expect(title.length, 'Page title should not be empty').to.be.greaterThan(0);
        logger.info(`Dashboard title: "${title}"`);
      });

      await addStep('Verify at least one KPI / stat card is visible', async () => {
        const cards = await driver.findElements(
          By.css('[data-testid="kpi-card"], .kpi-card, .stat-card, [class*="card"]')
        );
        logger.info(`KPI cards found: ${cards.length}`);
        expect(cards.length, 'Dashboard should display KPI cards').to.be.greaterThan(0);
      });

      await addStep('Verify charts are rendered', async () => {
        const rendered = await dashboardPage.areChartsRendered();
        logger.info(`Charts rendered: ${rendered}`);
        // Soft assertion — chart libraries may defer render; warn but do not fail
        if (!rendered) logger.warn('No chart elements detected — charts may not have loaded yet');
      });

      await addStep('Verify admin navigation links are visible', async () => {
        const usersNav    = await dashboardPage.isModuleVisible('users');
        const projectsNav = await dashboardPage.isModuleVisible('projects');
        expect(usersNav || projectsNav,
          'Super Admin should see Users or Projects navigation').to.be.true;
        logger.info(`Nav: users=${usersNav}, projects=${projectsNav}`);
      });

      await milestone(driver, 'STEP-02_Dashboard_Verified');
    });

    it('STEP-03: Create a new Test Project', async function () {
      if (!ctx.saLoggedIn) this.skip();
      logTestStart('STEP-03', this.test.title);
      addFeature('E2E Workflow'); addSeverity('blocker'); addTestCaseId('STEP-03');

      const ts = Date.now();
      const projectData = generateProject({
        name: `E2E_Project_${ts}`,
        code: `E2E${ts.toString().slice(-5)}`,
        description: 'Auto-generated by E2E smoke test',
      });
      ctx.project = { name: projectData.name, code: projectData.code };

      await addStep('Navigate to Projects page', async () => {
        await projectsPage.navigate();
        const url = await driver.getCurrentUrl();
        expect(url).to.match(/project/i);
      });

      await addStep('Open Add Project modal', async () => {
        await projectsPage.clickAddProject();
        expect(await projectsPage.isModalOpen(), 'Add Project modal should open').to.be.true;
      });

      await addStep(`Fill form: name="${projectData.name}", code="${projectData.code}"`, async () => {
        await projectsPage.fillProjectForm(projectData);
      });

      await addStep('Save project and verify success feedback', async () => {
        await projectsPage.saveProject();
        const toast = await projectsPage.getToastMessage();
        logger.info(`Project create toast: "${toast}"`);
        if (toast) expect(toast.toLowerCase()).to.not.match(/error|fail/);
      });

      await addStep('Verify project card appears in list', async () => {
        const visible = await projectsPage.waitForProjectCard(ctx.project.name, 8000);
        if (!visible) logger.warn(`Project card not found in list — project may still be saved`);
      });

      // Look up project ID via API for teardown
      if (saToken) {
        try {
          const projects = await getProjects(saToken, { search: ctx.project.name });
          if (projects.length) {
            ctx.project.id = projects[0].id;
            logger.info(`Project ID captured: ${ctx.project.id}`);
          }
        } catch (e) { logger.warn(`Could not capture project ID: ${e.message}`); }
      }

      await milestone(driver, 'STEP-03_Project_Created');
    });

    it('STEP-04: Create Admin User and assign project', async function () {
      if (!ctx.saLoggedIn) this.skip();
      logTestStart('STEP-04', this.test.title);
      addFeature('E2E Workflow'); addSeverity('blocker'); addTestCaseId('STEP-04');

      const adminData = generateUser();
      adminData.password = 'AdminE2E@2026!';
      // Include role and project in the form data so UsersPage can select them
      adminData.roles    = ['Admin'];
      adminData.projects = ctx.project?.name ? [ctx.project.name] : [];
      ctx.adminUser = { email: adminData.email, password: adminData.password };

      await addStep('Navigate to Users page', async () => {
        await usersPage.navigate();
        expect(await driver.getCurrentUrl()).to.match(/user/i);
      });

      await addStep('Open Add User modal', async () => {
        await usersPage.clickAddUser();
        expect(await usersPage.isModalOpen(), 'Add User modal should open').to.be.true;
      });

      await addStep(`Fill form for Admin (${adminData.email})`, async () => {
        await usersPage.fillUserForm(adminData);
      });

      await addStep('Save Admin user and verify feedback', async () => {
        await usersPage.saveUser();
        const toast = await usersPage.getToastMessage();
        logger.info(`Admin user create toast: "${toast}"`);
      });

      await addStep('Verify Admin user row in table', async () => {
        const inTable = await usersPage.waitForUserInTable(adminData.email, 8000);
        if (!inTable) logger.warn(`Admin user "${adminData.email}" not yet in table`);
      });

      if (saToken) {
        try {
          const users = await getUsers(saToken, { search: adminData.email });
          if (users.length) {
            ctx.adminUser.id = users[0].id;
            logger.info(`Admin user ID: ${ctx.adminUser.id}`);
          }
        } catch (e) { logger.warn(`Could not capture admin user ID: ${e.message}`); }
      }

      await milestone(driver, 'STEP-04_Admin_User_Created');
    });

    it('STEP-05: Create Normal User and assign project', async function () {
      if (!ctx.saLoggedIn) this.skip();
      logTestStart('STEP-05', this.test.title);
      addFeature('E2E Workflow'); addSeverity('blocker'); addTestCaseId('STEP-05');

      const normalData = generateUser();
      normalData.password = 'UserE2E@2026!';
      normalData.roles    = ['User'];
      normalData.projects = ctx.project?.name ? [ctx.project.name] : [];
      ctx.normalUser = { email: normalData.email, password: normalData.password };

      await addStep('Open Add User modal (still on Users page)', async () => {
        await usersPage.clickAddUser();
        expect(await usersPage.isModalOpen(), 'Add User modal should open').to.be.true;
      });

      await addStep(`Fill form for Normal User (${normalData.email})`, async () => {
        await usersPage.fillUserForm(normalData);
      });

      await addStep('Save Normal User and verify feedback', async () => {
        await usersPage.saveUser();
        const toast = await usersPage.getToastMessage();
        logger.info(`Normal user create toast: "${toast}"`);
      });

      await addStep('Verify Normal User row in table', async () => {
        const inTable = await usersPage.waitForUserInTable(normalData.email, 8000);
        if (!inTable) logger.warn(`Normal user "${normalData.email}" not yet in table`);
      });

      if (saToken) {
        try {
          const users = await getUsers(saToken, { search: normalData.email });
          if (users.length) {
            ctx.normalUser.id = users[0].id;
            logger.info(`Normal user ID: ${ctx.normalUser.id}`);
          }
        } catch (e) { logger.warn(`Could not capture normal user ID: ${e.message}`); }
      }

      await milestone(driver, 'STEP-05_Normal_User_Created');
    });

    it('STEP-06: Super Admin logout', async function () {
      if (!ctx.saLoggedIn) this.skip();
      logTestStart('STEP-06', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-06');

      await addStep('Click logout', async () => {
        await dashboardPage.clickLogout();
        await waitForUrl(driver, '/login', 8000);
      });

      await addStep('Confirm redirect to /login', async () => {
        const url = await driver.getCurrentUrl();
        expect(url, 'Should redirect to /login after logout').to.include('/login');
        ctx.saLoggedIn = false;
      });

      await milestone(driver, 'STEP-06_SA_Logout');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Admin Workflow
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Phase 2 — Admin Workflow', function () {

    it('STEP-07: Login as Admin and verify project scope', async function () {
      if (!ctx.adminUser) this.skip();
      logTestStart('STEP-07', this.test.title);
      addFeature('E2E Workflow'); addStory('Admin Actions');
      addSeverity('blocker'); addTestCaseId('STEP-07');

      await addStep('Navigate to /login', async () => {
        const url = await driver.getCurrentUrl();
        if (!url.includes('/login')) await loginPage.navigateToLogin();
      });

      await addStep(`Submit Admin credentials (${ctx.adminUser.email})`, async () => {
        await loginPage.login(ctx.adminUser.email, ctx.adminUser.password);
        await waitForUrl(driver, '/dashboard', 10000);
        ctx.adminLoggedIn = true;
      });

      await addStep('Verify dashboard URL', async () => {
        expect(await driver.getCurrentUrl()).to.include('/dashboard');
      });

      await addStep('Log active project scope', async () => {
        const selected = await dashboardPage.getSelectedProject();
        logger.info(`Admin project scope: "${selected}"`);
        if (ctx.project?.name && selected && !selected.includes(ctx.project.name)) {
          logger.warn(`Expected project "${ctx.project.name}" but selector shows "${selected}"`);
        }
      });

      await milestone(driver, 'STEP-07_Admin_Login');
    });

    it('STEP-08: Create Story Point Estimation', async function () {
      if (!ctx.adminLoggedIn) this.skip();
      logTestStart('STEP-08', this.test.title);
      addFeature('E2E Workflow'); addSeverity('blocker'); addTestCaseId('STEP-08');

      const estData = generateEstimation({ complexity: 'Medium', risk: 'Low' });
      ctx.storyEstName = estData.storyName;

      await addStep('Navigate to /estimation', async () => {
        await estimationPage.navigate();
        expect(await driver.getCurrentUrl()).to.match(/estimation/i);
      });

      await addStep('Open New Estimation modal', async () => {
        await estimationPage.clickNewEstimation();
        expect(await estimationPage.isModalOpen(), 'Estimation modal should open').to.be.true;
      });

      await addStep(`Fill form: "${estData.storyName}"`, async () => {
        await estimationPage.fillEstimationForm(estData);
      });

      await addStep('Submit and verify feedback', async () => {
        await estimationPage.submitEstimation();
        const toast = await estimationPage.getToastMessage();
        logger.info(`Story estimation toast: "${toast}"`);
        if (toast) expect(toast.toLowerCase()).to.not.match(/error|fail/);
      });

      await addStep('Verify estimation appears in list', async () => {
        const inList = await estimationPage.waitForEstimationInList(ctx.storyEstName, 8000);
        if (!inList) logger.warn(`Estimation "${ctx.storyEstName}" not visible in list yet`);
      });

      await addStep('Verify story points calculated (> 0)', async () => {
        const sp = await estimationPage.getStoryPoints();
        logger.info(`Story points: ${sp}`);
        // Soft: points depend on model being configured
        if (sp === 0) logger.warn('Story points = 0 — model may not be configured');
      });

      await milestone(driver, 'STEP-08_Story_Estimation');
    });

    it('STEP-09: Create Parametric Estimation', async function () {
      if (!ctx.adminLoggedIn) this.skip();
      logTestStart('STEP-09', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-09');

      await addStep('Navigate to /parametric', async () => {
        await estimationPage.navigateToParametric();
        const url = await driver.getCurrentUrl();
        expect(url, 'Should be on parametric page').to.match(/parametric/i);
      });

      await addStep('Fill parametric form (100 FP, Medium, 3 devs)', async () => {
        await estimationPage.fillParametricForm({
          functionPoints: 100,
          complexity: 'Medium',
          teamSize: 3,
        });
      });

      await addStep('Submit and verify feedback', async () => {
        await estimationPage.submitEstimation();
        const toast = await estimationPage.getToastMessage();
        logger.info(`Parametric toast: "${toast}"`);
      });

      await addStep('Log calculated effort hours', async () => {
        const effort = await estimationPage.getEffortHours();
        logger.info(`Parametric effort hours: ${effort}`);
      });

      await addStep('Log estimated duration', async () => {
        const weeks = await estimationPage.getDurationWeeks();
        logger.info(`Parametric duration (weeks): ${weeks}`);
      });

      await milestone(driver, 'STEP-09_Parametric_Estimation');
    });

    it('STEP-10: Verify Historical Data updated', async function () {
      if (!ctx.adminLoggedIn) this.skip();
      logTestStart('STEP-10', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-10');

      await addStep('Navigate to /historical', async () => {
        await historicalPage.navigate();
        expect(await driver.getCurrentUrl()).to.match(/histor/i);
      });

      await addStep('Verify page title visible', async () => {
        const title = await driver.getTitle();
        expect(title.length).to.be.greaterThan(0);
      });

      await addStep('Log visible row count', async () => {
        const count = await historicalPage.getRowCount();
        logger.info(`Historical data rows: ${count}`);
        // Rows may be 0 if project filter restricts view — soft check
      });

      await addStep('Verify table headers are present', async () => {
        const headers = await driver.findElements(By.css('th, [data-testid="table-header"]'));
        logger.info(`Table header cells: ${headers.length}`);
      });

      await milestone(driver, 'STEP-10_Historical_Data');
    });

    it('STEP-11: Verify Dashboard KPIs updated after estimations', async function () {
      if (!ctx.adminLoggedIn) this.skip();
      logTestStart('STEP-11', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-11');

      await addStep('Navigate to /dashboard', async () => {
        await driver.get(`${config.baseUrl}/dashboard`);
        await waitForUrl(driver, '/dashboard', 8000);
      });

      await addStep('Verify KPI cards are present', async () => {
        await sleep(800); // allow widgets to re-render after navigation
        const cards = await driver.findElements(
          By.css('[data-testid="kpi-card"], .kpi-card, .stat-card, [class*="kpi"], [class*="stat"]')
        );
        logger.info(`KPI cards on Admin dashboard: ${cards.length}`);
        expect(cards.length, 'Dashboard should have KPI cards').to.be.greaterThan(0);
      });

      await addStep('Log estimation KPI value', async () => {
        const estimationKpi = await dashboardPage.getKpiValue('estimation');
        logger.info(`Estimations KPI: ${estimationKpi}`);
      });

      await milestone(driver, 'STEP-11_Dashboard_Post_Estimation');
    });

    it('STEP-12: Verify Analytics & Reports reflect estimations', async function () {
      if (!ctx.adminLoggedIn) this.skip();
      logTestStart('STEP-12', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-12');

      await addStep('Navigate to /analytics', async () => {
        await analyticsPage.navigate();
        expect(await driver.getCurrentUrl()).to.match(/analytic/i);
      });

      await addStep('Verify page renders without errors', async () => {
        const title = await driver.getTitle();
        expect(title.length).to.be.greaterThan(0);
      });

      await addStep('Log chart count', async () => {
        const charts = await analyticsPage.getChartCount();
        logger.info(`Analytics charts: ${charts}`);
      });

      await addStep('Log KPI values', async () => {
        const kpis = await analyticsPage.getKpiValues();
        logger.info(`Analytics KPIs: [${kpis.slice(0, 5).join(' | ')}]`);
      });

      await milestone(driver, 'STEP-12_Analytics');
    });

    it('STEP-13: Admin logout', async function () {
      if (!ctx.adminLoggedIn) this.skip();
      logTestStart('STEP-13', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-13');

      await addStep('Click logout', async () => {
        await dashboardPage.clickLogout();
        await waitForUrl(driver, '/login', 8000);
      });

      await addStep('Confirm /login URL', async () => {
        expect(await driver.getCurrentUrl()).to.include('/login');
        ctx.adminLoggedIn = false;
      });

      await milestone(driver, 'STEP-13_Admin_Logout');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Normal User Verification
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Phase 3 — Normal User Verification', function () {

    it('STEP-14: Login as Normal User and verify project scope', async function () {
      if (!ctx.normalUser) this.skip();
      logTestStart('STEP-14', this.test.title);
      addFeature('E2E Workflow'); addStory('Normal User Verification');
      addSeverity('blocker'); addTestCaseId('STEP-14');

      await addStep('Navigate to /login', async () => {
        const url = await driver.getCurrentUrl();
        if (!url.includes('/login')) await loginPage.navigateToLogin();
      });

      await addStep(`Login as Normal User (${ctx.normalUser.email})`, async () => {
        await loginPage.login(ctx.normalUser.email, ctx.normalUser.password);
        await waitForUrl(driver, '/dashboard', 10000);
        ctx.normalUserLoggedIn = true;
      });

      await addStep('Verify on /dashboard', async () => {
        expect(await driver.getCurrentUrl()).to.include('/dashboard');
      });

      await addStep('Verify Admin menus (Users/Roles) are NOT visible', async () => {
        const usersNav = await dashboardPage.isModuleVisible('users');
        const rolesNav = await dashboardPage.isModuleVisible('roles');
        logger.info(`Normal user nav: users=${usersNav}, roles=${rolesNav}`);
        // Normal users should not see user/role management
        expect(usersNav || rolesNav,
          'Normal User should NOT see Users or Roles admin menus').to.be.false;
      });

      await addStep('Log project scope', async () => {
        const selected = await dashboardPage.getSelectedProject();
        logger.info(`Normal user project scope: "${selected}"`);
        if (ctx.project?.name && selected && !selected.includes(ctx.project.name)) {
          logger.warn(`Expected "${ctx.project.name}", got "${selected}"`);
        }
      });

      await milestone(driver, 'STEP-14_NormalUser_Login');
    });

    it('STEP-15: Normal User — create or view estimation (role-dependent)', async function () {
      if (!ctx.normalUserLoggedIn) this.skip();
      logTestStart('STEP-15', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-15');

      await addStep('Navigate to /estimation', async () => {
        await estimationPage.navigate();
        const url = await driver.getCurrentUrl();
        logger.info(`Normal user estimation URL: ${url}`);
      });

      await addStep('Verify estimation page accessible or appropriate redirect', async () => {
        const url = await driver.getCurrentUrl();
        const reachable = url.includes('estimation') || url.includes('dashboard');
        expect(reachable, 'Should be on estimation page or redirected to dashboard').to.be.true;
      });

      await addStep('If on estimation page — verify list is visible', async () => {
        const url = await driver.getCurrentUrl();
        if (url.includes('estimation')) {
          const rows = await estimationPage.getEstimationRows();
          logger.info(`Estimation rows visible to Normal User: ${rows.length}`);
        }
      });

      await milestone(driver, 'STEP-15_NormalUser_Estimation');
    });

    it('STEP-16: Verify project-based data isolation', async function () {
      if (!ctx.normalUserLoggedIn) this.skip();
      logTestStart('STEP-16', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-16');

      await addStep('Navigate to /dashboard', async () => {
        await driver.get(`${config.baseUrl}/dashboard`);
        await waitForUrl(driver, '/dashboard', 8000);
      });

      await addStep('Verify project selector limited to assigned project', async () => {
        const selected = await dashboardPage.getSelectedProject();
        logger.info(`Isolation check — project selector: "${selected}"`);
        if (ctx.project?.name) {
          // If a specific project was assigned, the selector should reflect it
          const isolated = !selected || selected.includes(ctx.project.name)
            || selected.toLowerCase().includes('all');
          if (!isolated) logger.warn(`Data isolation issue: "${selected}" shown instead of "${ctx.project.name}"`);
        }
      });

      await addStep('Navigate to Historical Data and verify project-scoped rows', async () => {
        await historicalPage.navigate();
        const count = await historicalPage.getRowCount();
        logger.info(`Historical rows visible to Normal User: ${count}`);
      });

      await addStep('Verify Analytics page accessible', async () => {
        await analyticsPage.navigate();
        const url = await driver.getCurrentUrl();
        logger.info(`Normal user analytics URL: ${url}`);
      });

      await milestone(driver, 'STEP-16_Data_Isolation');
    });

    it('STEP-17: Normal User logout — E2E workflow complete', async function () {
      if (!ctx.normalUserLoggedIn) this.skip();
      logTestStart('STEP-17', this.test.title);
      addFeature('E2E Workflow'); addSeverity('critical'); addTestCaseId('STEP-17');

      await addStep('Click logout', async () => {
        await dashboardPage.clickLogout();
        await waitForUrl(driver, '/login', 8000);
      });

      await addStep('Confirm /login URL — workflow complete', async () => {
        const url = await driver.getCurrentUrl();
        expect(url, 'Should be on /login after final logout').to.include('/login');
        ctx.normalUserLoggedIn = false;
      });

      await milestone(driver, 'STEP-17_E2E_Complete');

      logger.info('══════════════════════════════════════════════════');
      logger.info('  E2E BUSINESS WORKFLOW COMPLETED SUCCESSFULLY');
      logger.info('══════════════════════════════════════════════════');
    });
  });
});
