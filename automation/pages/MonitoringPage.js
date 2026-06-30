'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { sleep } = require('../helpers/WaitHelper');

class MonitoringPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      navLogMonitor: By.css('[data-testid="nav-logs"], a[href*="logs"]'),
      navHealthMonitor: By.css('[data-testid="nav-health"], a[href*="health"]'),
      logsPageHeading: By.xpath('//*[contains(text(),"Log Monitor") or contains(text(),"Application Logs") or contains(text(),"Logs")]'),
      healthPageHeading: By.xpath('//*[contains(text(),"Health Monitor") or contains(text(),"System Health") or contains(text(),"Health")]'),
      logEntries: By.css('[data-testid="log-entry"], .log-entry, table tbody tr'),
      logLevelFilter: By.css('[data-testid="log-level-filter"], select[name="level"]'),
    };
  }

  async navigateToLogs() {
    await super.navigate('/logs');
    await this.waitForPageLoad();
    await sleep(500);
  }

  async navigateToHealth() {
    await super.navigate('/health');
    await this.waitForPageLoad();
    await sleep(500);
  }

  async isOnLogsPage() {
    try {
      const url = await this.getCurrentUrl();
      if (url.includes('/logs')) return true;
      const heading = await this.driver.findElement(this.selectors.logsPageHeading);
      return heading.isDisplayed();
    } catch { return false; }
  }

  async isOnHealthPage() {
    try {
      const url = await this.getCurrentUrl();
      if (url.includes('/health')) return true;
      const heading = await this.driver.findElement(this.selectors.healthPageHeading);
      return heading.isDisplayed();
    } catch { return false; }
  }

  async getLogEntries() {
    const rows = await this.driver.findElements(this.selectors.logEntries);
    const entries = [];
    for (const row of rows) {
      try { entries.push(await row.getText()); } catch { /* stale */ }
    }
    return entries;
  }

  async navigateViaNav(module) {
    const sel = module === 'logs' ? this.selectors.navLogMonitor : this.selectors.navHealthMonitor;
    await this.click(sel);
    await sleep(800);
  }
}

module.exports = MonitoringPage;
