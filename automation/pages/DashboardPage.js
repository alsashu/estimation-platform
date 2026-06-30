'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { waitForElement, waitForUrl, sleep } = require('../helpers/WaitHelper');
const { logger } = require('../utils/LoggerUtil');

class DashboardPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      // Navigation
      navDashboard: By.css('[data-testid="nav-dashboard"], a[href*="dashboard"]'),
      navUsers: By.css('[data-testid="nav-users"], a[href*="users"]'),
      navProjects: By.css('[data-testid="nav-projects"], a[href*="projects"]'),
      navRoles: By.css('[data-testid="nav-roles"], a[href*="roles"]'),
      navEstimation: By.css('[data-testid="nav-estimation"], a[href*="estimation"]'),
      navHistorical: By.css('[data-testid="nav-historical"], a[href*="histor"]'),
      navAnalytics: By.css('[data-testid="nav-analytics"], a[href*="analytics"]'),
      navMasterData: By.css('[data-testid="nav-masterdata"], a[href*="master"]'),
      navParametric: By.css('[data-testid="nav-parametric"], a[href*="parametric"]'),
      navRegistration: By.css('[data-testid="nav-registration"], a[href*="registration"]'),
      navMonitoring: By.css('[data-testid="nav-monitoring"], a[href*="monitor"]'),
      navLogMonitor: By.css('[data-testid="nav-logs"], a[href*="logs"]'),
      navHealthMonitor: By.css('[data-testid="nav-health"], a[href*="health"]'),

      // Project selector
      projectSelector: By.css('[data-testid="project-selector"], .project-selector, [aria-label="Project selector"]'),
      projectSelectorDropdown: By.css('[data-testid="project-dropdown"], .project-dropdown-menu'),
      allProjectsOption: By.xpath('//*[contains(text(),"All Projects")]'),
      selectedProjectLabel: By.css('[data-testid="selected-project"], .project-selector-value'),

      // KPIs
      kpiCards: By.css('[data-testid="kpi-card"], .kpi-card, .stat-card'),
      totalEstimations: By.css('[data-testid="kpi-total-estimations"], [data-kpi="estimations"]'),
      totalUsers: By.css('[data-testid="kpi-total-users"], [data-kpi="users"]'),
      accuracyKpi: By.css('[data-testid="kpi-accuracy"], [data-kpi="accuracy"]'),

      // Charts
      chartContainers: By.css('canvas, .recharts-wrapper, [data-testid="chart"]'),

      // Notifications
      notificationBell: By.css('[data-testid="notification-bell"], .notification-bell, [aria-label*="notification"]'),
      notificationBadge: By.css('[data-testid="notification-badge"], .notification-badge, .badge-count'),
      notificationPanel: By.css('[data-testid="notification-panel"], .notification-panel, .notifications-dropdown'),

      // User menu / logout
      userMenu: By.css('[data-testid="user-menu"], .user-avatar, [aria-label="User menu"]'),
      logoutButton: By.css('[data-testid="logout"], [data-testid="logout-button"]'),
      logoutMenuItem: By.xpath('//*[contains(text(),"Logout") or contains(text(),"Sign Out") or contains(text(),"Log Out")]'),

      // Breadcrumb
      breadcrumb: By.css('[data-testid="breadcrumb"], .breadcrumb, nav[aria-label="breadcrumb"]'),

      // Dashboard content
      dashboardContent: By.css('[data-testid="dashboard"], .dashboard-page, main'),
      adminPanel: By.css('[data-testid="admin-panel"], .admin-section'),
    };
  }

  async isOnDashboard() {
    try {
      const url = await this.getCurrentUrl();
      return url.includes('/dashboard') || url.includes('/home');
    } catch {
      return false;
    }
  }

  async waitForDashboard() {
    await waitForUrl(this.driver, '/dashboard', 15000).catch(async () => {
      const url = await this.getCurrentUrl();
      if (url.includes('/login')) throw new Error('Still on login page after authentication');
    });
  }

  async getKpiValue(label) {
    // Try to find KPI card by label text
    const cards = await this.findElements(this.selectors.kpiCards);
    for (const card of cards) {
      try {
        const text = await card.getText();
        if (text.toLowerCase().includes(label.toLowerCase())) {
          // Extract numeric value
          const match = text.match(/[\d,]+/);
          return match ? parseInt(match[0].replace(',', ''), 10) : text;
        }
      } catch { /* skip stale */ }
    }
    // Fallback — return total from specific selector
    try {
      const el = await this.driver.findElement(this.selectors.totalEstimations);
      return parseInt((await el.getText()).replace(/\D/g, ''), 10);
    } catch { return 0; }
  }

  async getNotificationCount() {
    try {
      const badge = await this.driver.findElement(this.selectors.notificationBadge);
      const text = await badge.getText();
      return parseInt(text, 10) || 0;
    } catch { return 0; }
  }

  async openNotifications() {
    await this.click(this.selectors.notificationBell);
    await sleep(500);
  }

  async openProjectSelector() {
    const selectors = [this.selectors.projectSelector, By.css('.project-selector-trigger, .project-badge')];
    for (const sel of selectors) {
      try {
        await this.click(sel);
        await sleep(400);
        return;
      } catch { /* try next */ }
    }
  }

  async selectProject(name) {
    await this.openProjectSelector();
    await sleep(300);
    const option = By.xpath(`//*[contains(text(),"${name}")]`);
    await this.click(option);
    await sleep(800);
  }

  async selectAllProjects() {
    await this.openProjectSelector();
    await sleep(300);
    await this.click(this.selectors.allProjectsOption);
    await sleep(800);
  }

  async getSelectedProject() {
    try {
      return await this.getText(this.selectors.selectedProjectLabel);
    } catch {
      return '';
    }
  }

  async isAllProjectsOptionVisible() {
    await this.openProjectSelector();
    await sleep(300);
    const visible = await this.isVisible(this.selectors.allProjectsOption);
    // Close dropdown
    await this.driver.actions({ async: true }).sendKeys(require('selenium-webdriver').Key.ESCAPE).perform().catch(() => {});
    return visible;
  }

  async clickLogout() {
    try {
      await this.click(this.selectors.userMenu);
      await sleep(400);
    } catch { /* already expanded */ }
    try {
      await this.click(this.selectors.logoutButton);
      return;
    } catch { /* try menu item */ }
    await this.click(this.selectors.logoutMenuItem);
  }

  async navigateTo(module) {
    logger.info(`DashboardPage.navigateTo: ${module}`);
    const moduleMap = {
      users: this.selectors.navUsers,
      projects: this.selectors.navProjects,
      roles: this.selectors.navRoles,
      estimation: this.selectors.navEstimation,
      historical: this.selectors.navHistorical,
      analytics: this.selectors.navAnalytics,
      masterdata: this.selectors.navMasterData,
      parametric: this.selectors.navParametric,
      registration: this.selectors.navRegistration,
      monitoring: this.selectors.navMonitoring,
      logs: this.selectors.navLogMonitor,
      health: this.selectors.navHealthMonitor,
    };
    const sel = moduleMap[module.toLowerCase()];
    if (!sel) throw new Error(`Unknown module: ${module}`);
    await this.click(sel);
    await sleep(800);
  }

  async isModuleVisible(module) {
    const moduleMap = {
      users: this.selectors.navUsers,
      projects: this.selectors.navProjects,
      roles: this.selectors.navRoles,
      estimation: this.selectors.navEstimation,
      historical: this.selectors.navHistorical,
      analytics: this.selectors.navAnalytics,
    };
    const sel = moduleMap[module.toLowerCase()];
    if (!sel) return false;
    return this.isVisible(sel);
  }

  async isAdminPanelVisible() {
    return this.isPresent(this.selectors.adminPanel);
  }

  async areChartsRendered() {
    const charts = await this.findElements(this.selectors.chartContainers);
    return charts.length > 0;
  }
}

module.exports = DashboardPage;
