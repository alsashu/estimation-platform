'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { waitForElement, sleep, waitForInvisible } = require('../helpers/WaitHelper');
const { logger } = require('../utils/LoggerUtil');

class UsersPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      heading: By.css('h1, h2, [data-testid="page-heading"]'),
      addUserBtn: By.css('[data-testid="add-user-btn"], button[aria-label*="Add User"], button.add-user'),
      addUserBtnText: By.xpath('//button[contains(text(),"Add User") or contains(text(),"Create User") or contains(text(),"New User")]'),
      searchInput: By.css('[data-testid="search-input"], input[placeholder*="search" i], input[placeholder*="Search" i]'),
      tableRows: By.css('table tbody tr, [data-testid="user-row"]'),
      tableBody: By.css('table tbody'),
      noDataMessage: By.css('[data-testid="no-data"], .empty-state, td.text-center'),
      paginationNext: By.css('[data-testid="pagination-next"], button[aria-label="Next page"], .pagination-next'),
      paginationPrev: By.css('[data-testid="pagination-prev"], .pagination-prev'),
      paginationInfo: By.css('[data-testid="pagination-info"], .pagination-info'),

      // Modal fields
      modal: By.css('[role="dialog"], [data-testid="user-modal"]'),
      modalTitle: By.css('[role="dialog"] h2, [role="dialog"] h3, [data-testid="modal-title"]'),
      firstNameInput: By.css('[data-testid="first-name"], input[name="firstName"], input[placeholder*="First" i]'),
      lastNameInput: By.css('[data-testid="last-name"], input[name="lastName"], input[placeholder*="Last" i]'),
      usernameInput: By.css('[data-testid="username"], input[name="username"], input[placeholder*="username" i]'),
      emailInput: By.css('[data-testid="email"], input[name="email"], input[type="email"]'),
      passwordInput: By.css('[data-testid="password"], input[name="password"], input[type="password"]'),
      rolesContainer: By.css('[data-testid="roles-select"], [data-testid="roles-multiselect"]'),
      projectsContainer: By.css('[data-testid="projects-select"], [data-testid="projects-multiselect"]'),
      multiSelectInput: By.css('.multiselect-input, [data-testid="multiselect-search"]'),
      multiSelectOption: By.css('.multiselect-option, [data-testid="multiselect-option"]'),
      multiSelectChip: By.css('.chip, .tag, [data-testid="chip"]'),
      clearAllBtn: By.css('[data-testid="clear-all"], .clear-all-btn'),
      saveBtn: By.css('[data-testid="save-btn"], [data-testid="submit-btn"], button[type="submit"]'),
      cancelBtn: By.css('[data-testid="cancel-btn"], button[aria-label="Cancel"]'),
      closeBtn: By.css('[data-testid="close-modal"], [aria-label="Close"], button.modal-close'),
      formError: By.css('.field-error, [data-testid="field-error"], .error-text, [aria-invalid="true"]'),
      passwordError: By.css('[data-testid="password-error"], .password-policy-error'),
    };
  }

  async navigate() {
    await super.navigate('/users');
    await this.waitForPageLoad();
    await sleep(500);
  }

  async clickAddUser() {
    try {
      await this.click(this.selectors.addUserBtn);
    } catch {
      await this.click(this.selectors.addUserBtnText);
    }
    await this.waitForModal();
    await sleep(300);
  }

  async fillUserForm(data) {
    if (data.firstName !== undefined) await this.clearAndType(this.selectors.firstNameInput, data.firstName);
    if (data.lastName !== undefined) await this.clearAndType(this.selectors.lastNameInput, data.lastName);
    if (data.username !== undefined) await this.clearAndType(this.selectors.usernameInput, data.username);
    if (data.email !== undefined) await this.clearAndType(this.selectors.emailInput, data.email);
    if (data.password !== undefined) await this.clearAndType(this.selectors.passwordInput, data.password);
    if (data.roles && data.roles.length > 0) await this.selectRoles(data.roles);
    if (data.projects && data.projects.length > 0) await this.selectProjects(data.projects);
  }

  async _selectMultiSelectItems(containerSelector, items) {
    await this.click(containerSelector);
    await sleep(300);
    for (const item of items) {
      try {
        // Type in search
        const inputs = await this.driver.findElements(this.selectors.multiSelectInput);
        if (inputs.length > 0) {
          await inputs[inputs.length - 1].sendKeys(item);
          await sleep(300);
        }
        // Click matching option
        const option = By.xpath(`//li[contains(text(),"${item}")] | //*[@data-testid="multiselect-option" and contains(text(),"${item}")]`);
        await this.click(option);
        await sleep(200);
      } catch (err) {
        logger.warn(`Could not select multi-select item "${item}": ${err.message}`);
      }
    }
    // Close dropdown by pressing Escape
    await this.driver.actions({ async: true }).sendKeys(require('selenium-webdriver').Key.ESCAPE).perform().catch(() => {});
    await sleep(200);
  }

  async selectRoles(roles) {
    await this._selectMultiSelectItems(this.selectors.rolesContainer, roles);
  }

  async selectProjects(projects) {
    await this._selectMultiSelectItems(this.selectors.projectsContainer, projects);
  }

  async clearRoles() {
    try {
      await this.click(this.selectors.rolesContainer);
      await sleep(200);
      const clearBtns = await this.driver.findElements(this.selectors.clearAllBtn);
      if (clearBtns.length > 0) await clearBtns[0].click();
    } catch { /* ignore */ }
  }

  async clearProjects() {
    try {
      await this.click(this.selectors.projectsContainer);
      await sleep(200);
      const clearBtns = await this.driver.findElements(this.selectors.clearAllBtn);
      if (clearBtns.length > 0) await clearBtns[clearBtns.length - 1].click();
    } catch { /* ignore */ }
  }

  async saveUser() {
    await this.click(this.selectors.saveBtn);
    await sleep(1500);
  }

  async cancelModal() {
    try {
      await this.click(this.selectors.cancelBtn);
    } catch {
      await this.click(this.selectors.closeBtn);
    }
    await this.waitForModalClose();
  }

  async searchUser(term) {
    logger.info(`UsersPage.searchUser: "${term}"`);
    const input = await waitForElement(this.driver, this.selectors.searchInput);
    await input.clear();
    await input.sendKeys(term);
    await sleep(800);
  }

  async getUserRows() {
    return this.driver.findElements(this.selectors.tableRows);
  }

  async getUserRowByEmail(email) {
    const rows = await this.getUserRows();
    for (const row of rows) {
      try {
        const text = await row.getText();
        if (text.includes(email)) return row;
      } catch { /* stale */ }
    }
    return null;
  }

  async isUserInTable(email) {
    const row = await this.getUserRowByEmail(email);
    return row !== null;
  }

  async waitForUserInTable(email, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.isUserInTable(email)) return true;
      await sleep(500);
    }
    return false;
  }

  async _clickRowAction(email, actionSelector) {
    const row = await this.getUserRowByEmail(email);
    if (!row) throw new Error(`User not found in table: ${email}`);
    const btn = await row.findElement(actionSelector);
    await btn.click();
    await sleep(500);
  }

  async clickEditUser(email) {
    const editSelectors = [
      By.css('[data-testid="edit-btn"], [aria-label="Edit"]'),
      By.css('button.edit-btn, button.btn-edit'),
      By.xpath('.//button[contains(@class,"edit") or contains(text(),"Edit")]'),
    ];
    const row = await this.getUserRowByEmail(email);
    if (!row) throw new Error(`User not found: ${email}`);
    for (const sel of editSelectors) {
      try {
        const btn = await row.findElement(sel);
        await btn.click();
        await this.waitForModal();
        return;
      } catch { /* try next */ }
    }
    throw new Error(`Edit button not found for user: ${email}`);
  }

  async clickDeleteUser(email) {
    const deleteSelectors = [
      By.css('[data-testid="delete-btn"], [aria-label="Delete"]'),
      By.css('button.delete-btn, button.btn-delete'),
      By.xpath('.//button[contains(@class,"delete") or contains(text(),"Delete")]'),
    ];
    const row = await this.getUserRowByEmail(email);
    if (!row) throw new Error(`User not found: ${email}`);
    for (const sel of deleteSelectors) {
      try {
        const btn = await row.findElement(sel);
        await btn.click();
        await sleep(500);
        return;
      } catch { /* try next */ }
    }
    throw new Error(`Delete button not found for user: ${email}`);
  }

  async isDeleteButtonPresentForUser(email) {
    const row = await this.getUserRowByEmail(email);
    if (!row) return false;
    try {
      const btn = await row.findElement(By.css('[data-testid="delete-btn"], button[aria-label="Delete"], .delete-btn'));
      return btn.isDisplayed();
    } catch { return false; }
  }

  async confirmDelete() {
    const confirmSelectors = [
      By.css('[data-testid="confirm-delete"], [data-testid="confirm-btn"]'),
      By.xpath('//button[contains(text(),"Confirm") or contains(text(),"Delete") or contains(text(),"Yes")]'),
      By.css('button.btn-danger, button.btn-destructive'),
    ];
    for (const sel of confirmSelectors) {
      try {
        await this.click(sel);
        await sleep(1000);
        return;
      } catch { /* try next */ }
    }
  }

  async toggleUserActive(email) {
    const row = await this.getUserRowByEmail(email);
    if (!row) throw new Error(`User not found: ${email}`);
    const toggleSelectors = [
      By.css('[data-testid="toggle-active"], [data-testid="enable-btn"], [data-testid="disable-btn"]'),
      By.xpath('.//button[contains(text(),"Enable") or contains(text(),"Disable") or contains(text(),"Activate") or contains(text(),"Deactivate")]'),
      By.css('button.toggle-status'),
    ];
    for (const sel of toggleSelectors) {
      try {
        const btn = await row.findElement(sel);
        await btn.click();
        await sleep(1000);
        return;
      } catch { /* try next */ }
    }
    throw new Error(`Toggle button not found for user: ${email}`);
  }

  async getProjectsForUser(email) {
    const row = await this.getUserRowByEmail(email);
    if (!row) return [];
    try {
      const projectCell = await row.findElement(
        By.css('[data-testid="user-projects"], .projects-cell, td:nth-child(3)')
      );
      const text = await projectCell.getText();
      return text.split(',').map(p => p.trim()).filter(Boolean);
    } catch { return []; }
  }

  async getRowCount() {
    const rows = await this.getUserRows();
    return rows.length;
  }

  async isOnPage(pageNum) {
    try {
      const info = await this.getText(this.selectors.paginationInfo);
      return info.includes(String(pageNum));
    } catch { return false; }
  }

  async goToNextPage() {
    await this.click(this.selectors.paginationNext);
    await sleep(800);
  }

  async getFormErrors() {
    const errors = await this.findElements(this.selectors.formError);
    const messages = [];
    for (const e of errors) {
      try { messages.push(await e.getText()); } catch { /* skip */ }
    }
    return messages.filter(Boolean);
  }
}

module.exports = UsersPage;
