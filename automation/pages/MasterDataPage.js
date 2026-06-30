'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { sleep } = require('../helpers/WaitHelper');

class MasterDataPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      tabs: By.css('[role="tab"], .tab-btn, [data-testid^="tab-"]'),
      storyPointsTab: By.xpath('//*[@role="tab" and (contains(text(),"Story Point") or contains(text(),"story"))]'),
      effortTab: By.xpath('//*[@role="tab" and (contains(text(),"Effort") or contains(text(),"effort"))]'),
      competencyTab: By.xpath('//*[@role="tab" and (contains(text(),"Competency") or contains(text(),"competency"))]'),
      addBtn: By.css('[data-testid="add-btn"]'),
      addBtnText: By.xpath('//button[contains(text(),"Add") or contains(text(),"Create") or contains(text(),"New")]'),
      tableRows: By.css('table tbody tr, [data-testid="data-row"]'),
      valueInput: By.css('[data-testid="value-input"], input[name="value"], input[name="points"]'),
      labelInput: By.css('[data-testid="label-input"], input[name="label"], input[name="name"]'),
      minHoursInput: By.css('[data-testid="min-hours"], input[name="minHours"], input[name="minEffort"]'),
      maxHoursInput: By.css('[data-testid="max-hours"], input[name="maxHours"], input[name="maxEffort"]'),
      percentageInput: By.css('[data-testid="percentage"], input[name="percentage"], input[name="multiplier"]'),
      saveBtn: By.css('[data-testid="save-btn"], button[type="submit"]'),
      cancelBtn: By.css('[data-testid="cancel-btn"]'),
      editBtn: By.css('[data-testid="edit-btn"], button[aria-label="Edit"]'),
      deleteBtn: By.css('[data-testid="delete-btn"], button[aria-label="Delete"]'),
      formError: By.css('.field-error, [data-testid="field-error"], .error-text'),
    };
  }

  async navigate() {
    await super.navigate('/master-data');
    await this.waitForPageLoad();
    await sleep(500);
  }

  async navigateToTab(tab) {
    const tabMap = {
      'Story Points': this.selectors.storyPointsTab,
      'Effort Estimates': this.selectors.effortTab,
      Competency: this.selectors.competencyTab,
    };
    const sel = tabMap[tab];
    if (!sel) throw new Error(`Unknown tab: ${tab}`);
    await this.click(sel);
    await sleep(500);
  }

  async clickAdd() {
    try { await this.click(this.selectors.addBtn); }
    catch { await this.click(this.selectors.addBtnText); }
    await this.waitForModal();
  }

  async addStoryPoint(value, label) {
    await this.clickAdd();
    await this.clearAndType(this.selectors.valueInput, String(value));
    if (label) await this.clearAndType(this.selectors.labelInput, label);
    await this.click(this.selectors.saveBtn);
    await sleep(1000);
  }

  async editStoryPoint(oldValue, newData) {
    const row = await this.getRowByValue('Story Points', String(oldValue));
    if (!row) throw new Error(`Story point not found: ${oldValue}`);
    const btn = await row.findElement(this.selectors.editBtn);
    await btn.click();
    await this.waitForModal();
    if (newData.value) await this.clearAndType(this.selectors.valueInput, String(newData.value));
    if (newData.label) await this.clearAndType(this.selectors.labelInput, newData.label);
    await this.click(this.selectors.saveBtn);
    await sleep(1000);
  }

  async deleteStoryPoint(label) {
    const row = await this.getRowByValue('Story Points', label);
    if (!row) throw new Error(`Story point not found: ${label}`);
    const btn = await row.findElement(this.selectors.deleteBtn);
    await btn.click();
    await sleep(400);
    try {
      await this.click(By.xpath('//button[contains(text(),"Confirm") or contains(text(),"Delete") or contains(text(),"Yes")]'));
    } catch { /* no confirm */ }
    await sleep(800);
  }

  async addEffortEstimate(data) {
    await this.clickAdd();
    if (data.label) await this.clearAndType(this.selectors.labelInput, data.label);
    if (data.minHours !== undefined) await this.clearAndType(this.selectors.minHoursInput, String(data.minHours));
    if (data.maxHours !== undefined) await this.clearAndType(this.selectors.maxHoursInput, String(data.maxHours));
    await this.click(this.selectors.saveBtn);
    await sleep(1000);
  }

  async addCompetencyLevel(data) {
    await this.clickAdd();
    if (data.name) await this.clearAndType(this.selectors.labelInput, data.name);
    if (data.percentage !== undefined) await this.clearAndType(this.selectors.percentageInput, String(data.percentage));
    await this.click(this.selectors.saveBtn);
    await sleep(1000);
  }

  async getTableRows(section) {
    return this.driver.findElements(this.selectors.tableRows);
  }

  async getRowByValue(section, value) {
    const rows = await this.getTableRows(section);
    for (const row of rows) {
      try {
        const text = await row.getText();
        if (text.includes(value)) return row;
      } catch { /* stale */ }
    }
    return null;
  }

  async isRowPresent(section, value) {
    return (await this.getRowByValue(section, value)) !== null;
  }

  async getFormErrors() {
    const errors = await this.driver.findElements(this.selectors.formError);
    const msgs = [];
    for (const e of errors) {
      try { const t = await e.getText(); if (t) msgs.push(t); } catch { /* skip */ }
    }
    return msgs;
  }
}

module.exports = MasterDataPage;
