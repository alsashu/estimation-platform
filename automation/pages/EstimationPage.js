'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { sleep, waitForElement } = require('../helpers/WaitHelper');

class EstimationPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      newEstimationBtn: By.css('[data-testid="new-estimation-btn"]'),
      // Parametric-specific
      functionPointsInput: By.css('[data-testid="function-points"], input[name="functionPoints"], input[name="functionPoint"], input[placeholder*="function" i], input[placeholder*="FP" i]'),
      teamSizeInput: By.css('[data-testid="team-size"], input[name="teamSize"], input[name="team_size"], input[placeholder*="team" i]'),
      durationOutput: By.css('[data-testid="duration-weeks"], [data-testid="duration"], .duration-result, [data-testid="estimated-duration"]'),
      parametricNameInput: By.css('[data-testid="estimation-name"], input[name="name"], input[placeholder*="name" i]'),
      newEstimationBtnText: By.xpath('//button[contains(text(),"New Estimation") or contains(text(),"Create Estimation") or contains(text(),"Add Estimation")]'),
      estimationRows: By.css('table tbody tr, [data-testid="estimation-row"]'),
      modal: By.css('[role="dialog"]'),
      storyNameInput: By.css('[data-testid="story-name"], input[name="storyName"], input[name="name"], input[placeholder*="story" i]'),
      complexitySelect: By.css('[data-testid="complexity"], select[name="complexity"]'),
      riskSelect: By.css('[data-testid="risk"], select[name="risk"]'),
      competencySelect: By.css('[data-testid="competency"], select[name="competency"]'),
      storyPointsOutput: By.css('[data-testid="story-points-output"], [data-testid="story-points"], .story-points-result'),
      effortHoursOutput: By.css('[data-testid="effort-hours"], .effort-hours-result'),
      descInput: By.css('[data-testid="description"], textarea[name="description"]'),
      submitBtn: By.css('[data-testid="submit-btn"], button[type="submit"]'),
      saveBtn: By.css('[data-testid="save-btn"], button.save-btn'),
      cancelBtn: By.css('[data-testid="cancel-btn"]'),
      editBtn: By.css('[data-testid="edit-btn"], button[aria-label="Edit"]'),
      deleteBtn: By.css('[data-testid="delete-btn"], button[aria-label="Delete"]'),
      formErrors: By.css('.field-error, [data-testid="field-error"], [aria-invalid="true"]'),
    };
  }

  async navigate() {
    await super.navigate('/estimation');
    await this.waitForPageLoad();
    await sleep(500);
  }

  async navigateToParametric() {
    await super.navigate('/parametric');
    await this.waitForPageLoad();
    await sleep(500);
  }

  async fillParametricForm(data) {
    if (data.name) {
      try { await this.clearAndType(this.selectors.parametricNameInput, data.name); } catch { /* optional field */ }
    }
    if (data.functionPoints != null) {
      try { await this.clearAndType(this.selectors.functionPointsInput, String(data.functionPoints)); } catch { /* optional */ }
    }
    if (data.complexity) {
      try { await this.selectByText(this.selectors.complexitySelect, data.complexity); } catch { /* custom select */ }
    }
    if (data.teamSize != null) {
      try { await this.clearAndType(this.selectors.teamSizeInput, String(data.teamSize)); } catch { /* optional */ }
    }
  }

  async getDurationWeeks() {
    try {
      const el = await this.driver.findElement(this.selectors.durationOutput);
      const text = await el.getText();
      return parseFloat(text.replace(/[^\d.]/g, '')) || null;
    } catch { return null; }
  }

  async clickNewEstimation() {
    try { await this.click(this.selectors.newEstimationBtn); }
    catch { await this.click(this.selectors.newEstimationBtnText); }
    await this.waitForModal();
  }

  async fillEstimationForm(data) {
    if (data.storyName) await this.clearAndType(this.selectors.storyNameInput, data.storyName);
    if (data.description) {
      try { await this.clearAndType(this.selectors.descInput, data.description); } catch { /* optional */ }
    }
    if (data.complexity) {
      try { await this.selectByText(this.selectors.complexitySelect, data.complexity); }
      catch { /* might be custom select */ }
    }
    if (data.risk) {
      try { await this.selectByText(this.selectors.riskSelect, data.risk); }
      catch { /* might be custom select */ }
    }
    if (data.competency) {
      try { await this.selectByText(this.selectors.competencySelect, data.competency); }
      catch { /* optional */ }
    }
  }

  async submitEstimation() {
    try { await this.click(this.selectors.submitBtn); }
    catch { await this.click(this.selectors.saveBtn); }
    await sleep(1500);
  }

  async getStoryPoints() {
    try {
      const el = await this.driver.findElement(this.selectors.storyPointsOutput);
      const text = await el.getText();
      return parseFloat(text.replace(/[^\d.]/g, '')) || 0;
    } catch { return 0; }
  }

  async getEffortHours() {
    try {
      const el = await this.driver.findElement(this.selectors.effortHoursOutput);
      const text = await el.getText();
      return parseFloat(text.replace(/[^\d.]/g, '')) || 0;
    } catch { return 0; }
  }

  async getEstimationRows() {
    return this.driver.findElements(this.selectors.estimationRows);
  }

  async getEstimationRowByName(storyName) {
    const rows = await this.getEstimationRows();
    for (const row of rows) {
      try {
        const text = await row.getText();
        if (text.includes(storyName)) return row;
      } catch { /* stale */ }
    }
    return null;
  }

  async isEstimationInList(storyName) {
    return (await this.getEstimationRowByName(storyName)) !== null;
  }

  async waitForEstimationInList(storyName, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.isEstimationInList(storyName)) return true;
      await sleep(500);
    }
    return false;
  }

  async editEstimation(storyName, updates) {
    const row = await this.getEstimationRowByName(storyName);
    if (!row) throw new Error(`Estimation not found: ${storyName}`);
    const btn = await row.findElement(this.selectors.editBtn);
    await btn.click();
    await this.waitForModal();
    await this.fillEstimationForm(updates);
    await this.submitEstimation();
  }

  async deleteEstimation(storyName) {
    const row = await this.getEstimationRowByName(storyName);
    if (!row) throw new Error(`Estimation not found: ${storyName}`);
    const btn = await row.findElement(this.selectors.deleteBtn);
    await btn.click();
    await sleep(400);
    try {
      const confirmBtn = await this.driver.findElement(
        By.xpath('//button[contains(text(),"Confirm") or contains(text(),"Delete") or contains(text(),"Yes")]')
      );
      await confirmBtn.click();
    } catch { /* no confirm needed */ }
    await sleep(1000);
  }

  async getFormErrors() {
    const errors = await this.driver.findElements(this.selectors.formErrors);
    const msgs = [];
    for (const e of errors) {
      try { const t = await e.getText(); if (t) msgs.push(t); } catch { /* skip */ }
    }
    return msgs;
  }

  async getEstimationCount() {
    const rows = await this.getEstimationRows();
    return rows.length;
  }
}

module.exports = EstimationPage;
