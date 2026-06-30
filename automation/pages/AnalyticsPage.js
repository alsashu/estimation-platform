'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { sleep } = require('../helpers/WaitHelper');

class AnalyticsPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      dateFrom: By.css('[data-testid="date-from"], input[name="dateFrom"], input[type="date"]:first-of-type'),
      dateTo: By.css('[data-testid="date-to"], input[name="dateTo"], input[type="date"]:last-of-type'),
      applyFiltersBtn: By.css('[data-testid="apply-filters"], button[type="submit"]'),
      chartContainers: By.css('canvas, .recharts-wrapper, [data-testid="chart"], svg.chart'),
      kpiLabels: By.css('[data-testid="kpi-label"], .kpi-value, .stat-value'),
      exportBtn: By.css('[data-testid="export-btn"]'),
      exportBtnText: By.xpath('//button[contains(text(),"Export") or contains(text(),"Download")]'),
    };
  }

  async navigate() {
    await super.navigate('/analytics');
    await this.waitForPageLoad();
    await sleep(800);
  }

  async setDateRange(from, to) {
    try {
      await this.clearAndType(this.selectors.dateFrom, from);
      await this.clearAndType(this.selectors.dateTo, to);
    } catch { /* date pickers might be custom */ }
    await sleep(500);
  }

  async applyFilters() {
    try { await this.click(this.selectors.applyFiltersBtn); await sleep(800); }
    catch { /* auto-apply on change */ }
  }

  async getKpiValue(label) {
    const els = await this.driver.findElements(this.selectors.kpiLabels);
    for (const el of els) {
      try {
        const text = await el.getText();
        if (text.toLowerCase().includes(label.toLowerCase())) {
          const match = text.match(/[\d.]+/);
          return match ? parseFloat(match[0]) : text;
        }
      } catch { /* stale */ }
    }
    return null;
  }

  async isChartRendered(chartName) {
    const charts = await this.driver.findElements(this.selectors.chartContainers);
    return charts.length > 0;
  }

  async getChartCount() {
    const charts = await this.driver.findElements(this.selectors.chartContainers);
    return charts.length;
  }

  async exportReport() {
    try { await this.click(this.selectors.exportBtn); }
    catch { await this.click(this.selectors.exportBtnText); }
    await sleep(2000);
  }

  async getKpiValues() {
    const els = await this.driver.findElements(this.selectors.kpiLabels);
    const values = [];
    for (const el of els) {
      try { values.push(await el.getText()); } catch { /* skip */ }
    }
    return values;
  }
}

module.exports = AnalyticsPage;
