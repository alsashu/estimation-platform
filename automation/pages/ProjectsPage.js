'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { waitForElement, sleep } = require('../helpers/WaitHelper');

class ProjectsPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      heading: By.css('h1, h2, [data-testid="page-heading"]'),
      addProjectBtn: By.css('[data-testid="add-project-btn"]'),
      addProjectBtnText: By.xpath('//button[contains(text(),"Add Project") or contains(text(),"Create Project") or contains(text(),"New Project")]'),
      projectCards: By.css('[data-testid="project-card"], .project-card'),
      modal: By.css('[role="dialog"]'),
      nameInput: By.css('[data-testid="project-name"], input[name="name"], input[placeholder*="Name" i]'),
      codeInput: By.css('[data-testid="project-code"], input[name="code"], input[placeholder*="Code" i]'),
      descInput: By.css('[data-testid="project-desc"], textarea[name="description"], input[name="description"]'),
      statusSelect: By.css('[data-testid="project-status"], select[name="status"]'),
      saveBtn: By.css('[data-testid="save-btn"], button[type="submit"]'),
      cancelBtn: By.css('[data-testid="cancel-btn"], button[aria-label="Cancel"]'),
      formError: By.css('.field-error, [data-testid="field-error"], .error-text'),
    };
  }

  async navigate() {
    await super.navigate('/projects');
    await this.waitForPageLoad();
    await sleep(500);
  }

  async clickAddProject() {
    try {
      await this.click(this.selectors.addProjectBtn);
    } catch {
      await this.click(this.selectors.addProjectBtnText);
    }
    await this.waitForModal();
  }

  async fillProjectForm(data) {
    if (data.name) await this.clearAndType(this.selectors.nameInput, data.name);
    if (data.code) await this.clearAndType(this.selectors.codeInput, data.code);
    if (data.description) await this.clearAndType(this.selectors.descInput, data.description);
    if (data.status) {
      try { await this.selectByText(this.selectors.statusSelect, data.status); }
      catch { /* may not be a <select> */ }
    }
  }

  async saveProject() {
    await this.click(this.selectors.saveBtn);
    await sleep(1500);
  }

  async getProjectCards() {
    return this.driver.findElements(this.selectors.projectCards);
  }

  async getProjectCard(name) {
    const cards = await this.getProjectCards();
    for (const card of cards) {
      try {
        const text = await card.getText();
        if (text.includes(name)) return card;
      } catch { /* stale */ }
    }
    return null;
  }

  async isProjectVisible(name) {
    const card = await this.getProjectCard(name);
    return card !== null;
  }

  async waitForProjectCard(name, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.isProjectVisible(name)) return true;
      await sleep(500);
    }
    return false;
  }

  async clickEditProject(name) {
    const card = await this.getProjectCard(name);
    if (!card) throw new Error(`Project card not found: ${name}`);
    const btn = await card.findElement(
      By.css('[data-testid="edit-btn"], button[aria-label="Edit"], .edit-btn')
    );
    await btn.click();
    await this.waitForModal();
  }

  async clickDeleteProject(name) {
    const card = await this.getProjectCard(name);
    if (!card) throw new Error(`Project card not found: ${name}`);
    const btn = await card.findElement(
      By.css('[data-testid="delete-btn"], button[aria-label="Delete"], .delete-btn')
    );
    await btn.click();
    await sleep(500);
  }

  async confirmDelete() {
    const confirmSelectors = [
      By.css('[data-testid="confirm-delete"]'),
      By.xpath('//button[contains(text(),"Confirm") or contains(text(),"Delete") or contains(text(),"Yes")]'),
      By.css('button.btn-danger'),
    ];
    for (const sel of confirmSelectors) {
      try { await this.click(sel); await sleep(1000); return; } catch { /* try next */ }
    }
  }

  async toggleProjectActive(name) {
    const card = await this.getProjectCard(name);
    if (!card) throw new Error(`Project card not found: ${name}`);
    const btn = await card.findElement(
      By.xpath('.//button[contains(text(),"Enable") or contains(text(),"Disable") or contains(text(),"Archive") or contains(text(),"Activate")]')
    );
    await btn.click();
    await sleep(1000);
  }

  async getProjectStatus(name) {
    const card = await this.getProjectCard(name);
    if (!card) return null;
    try {
      const badge = await card.findElement(By.css('[data-testid="status-badge"], .badge, .status'));
      return (await badge.getText()).toLowerCase();
    } catch { return null; }
  }

  async getCardCount() {
    const cards = await this.getProjectCards();
    return cards.length;
  }
}

module.exports = ProjectsPage;
