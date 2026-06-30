'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { sleep } = require('../helpers/WaitHelper');

class RolesPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      addRoleBtn: By.css('[data-testid="add-role-btn"]'),
      addRoleBtnText: By.xpath('//button[contains(text(),"Add Role") or contains(text(),"Create Role") or contains(text(),"New Role")]'),
      roleItems: By.css('[data-testid="role-card"], .role-card, [data-testid="role-row"]'),
      modal: By.css('[role="dialog"]'),
      roleNameInput: By.css('[data-testid="role-name"], input[name="name"]'),
      roleDescInput: By.css('[data-testid="role-desc"], textarea[name="description"], input[name="description"]'),
      permissionCheckboxes: By.css('input[type="checkbox"][name*="permission"], [data-testid="permission-check"]'),
      moduleCheckboxes: By.css('[data-testid="module-select-all"], input[type="checkbox"].module-all'),
      saveBtn: By.css('[data-testid="save-btn"], button[type="submit"]'),
      cancelBtn: By.css('[data-testid="cancel-btn"]'),
      deleteBtn: By.css('[data-testid="delete-btn"], button[aria-label="Delete"]'),
      editBtn: By.css('[data-testid="edit-btn"], button[aria-label="Edit"]'),
    };
  }

  async navigate() {
    await super.navigate('/roles');
    await this.waitForPageLoad();
    await sleep(500);
  }

  async clickAddRole() {
    try { await this.click(this.selectors.addRoleBtn); }
    catch { await this.click(this.selectors.addRoleBtnText); }
    await this.waitForModal();
  }

  async fillRoleForm(name, description, permissions = []) {
    if (name) await this.clearAndType(this.selectors.roleNameInput, name);
    if (description) await this.clearAndType(this.selectors.roleDescInput, description);
    for (const perm of permissions) {
      await this.selectPermission(perm);
    }
  }

  async selectPermission(permissionName) {
    const selector = By.xpath(
      `//label[contains(text(),"${permissionName}")]/input | //input[@value="${permissionName}"]`
    );
    try {
      const el = await this.driver.findElement(selector);
      const checked = await el.isSelected();
      if (!checked) await el.click();
    } catch {
      // Permission checkbox not found — warn but don't fail
    }
  }

  async selectAllPermissionsForModule(moduleName) {
    const selector = By.xpath(
      `//label[contains(text(),"${moduleName}")]/preceding-sibling::input[@type="checkbox"] | ` +
      `//*[contains(text(),"${moduleName}")]/following-sibling::input[@type="checkbox"][1]`
    );
    try {
      const el = await this.driver.findElement(selector);
      if (!await el.isSelected()) await el.click();
    } catch { /* module checkbox not found */ }
  }

  async saveRole() {
    await this.click(this.selectors.saveBtn);
    await sleep(1500);
  }

  async getRoleItem(name) {
    const items = await this.driver.findElements(this.selectors.roleItems);
    for (const item of items) {
      try {
        const text = await item.getText();
        if (text.includes(name)) return item;
      } catch { /* stale */ }
    }
    return null;
  }

  async isRoleVisible(name) {
    return (await this.getRoleItem(name)) !== null;
  }

  async editRole(name, permissions = []) {
    const item = await this.getRoleItem(name);
    if (!item) throw new Error(`Role not found: ${name}`);
    const btn = await item.findElement(this.selectors.editBtn);
    await btn.click();
    await this.waitForModal();
    for (const perm of permissions) {
      await this.selectPermission(perm);
    }
  }

  async deleteRole(name) {
    const item = await this.getRoleItem(name);
    if (!item) throw new Error(`Role not found: ${name}`);
    const btn = await item.findElement(this.selectors.deleteBtn);
    await btn.click();
    await sleep(500);
    // Confirm
    try {
      const confirmBtn = await this.driver.findElement(
        By.xpath('//button[contains(text(),"Confirm") or contains(text(),"Delete") or contains(text(),"Yes")]')
      );
      await confirmBtn.click();
      await sleep(1000);
    } catch { /* no confirm dialog */ }
  }

  async getRolePermissions(name) {
    const item = await this.getRoleItem(name);
    if (!item) return [];
    const text = await item.getText();
    return text.split('\n').filter(l => l.trim());
  }
}

module.exports = RolesPage;
