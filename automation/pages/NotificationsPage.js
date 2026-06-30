'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { sleep, waitForElement } = require('../helpers/WaitHelper');

class NotificationsPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      bell: By.css('[data-testid="notification-bell"], .notification-bell, [aria-label*="notification" i]'),
      badge: By.css('[data-testid="notification-badge"], .notification-badge, .badge-count, .unread-count'),
      panel: By.css('[data-testid="notification-panel"], .notification-panel, .notifications-list'),
      notificationItems: By.css('[data-testid="notification-item"], .notification-item'),
      markReadBtn: By.css('[data-testid="mark-read"], .mark-read-btn'),
      markAllReadBtn: By.css('[data-testid="mark-all-read"]'),
      markAllReadBtnText: By.xpath('//button[contains(text(),"Mark all") or contains(text(),"Read all")]'),
      unreadItem: By.css('[data-testid="notification-item"].unread, .notification-item.unread, [data-unread="true"]'),
    };
  }

  async getBadgeCount() {
    try {
      const badge = await this.driver.findElement(this.selectors.badge);
      const text = await badge.getText();
      return parseInt(text, 10) || 0;
    } catch { return 0; }
  }

  async isBadgeBlinkin() {
    try {
      const badge = await this.driver.findElement(this.selectors.badge);
      const cls = await badge.getAttribute('class');
      return cls.includes('blink') || cls.includes('pulse') || cls.includes('animate');
    } catch { return false; }
  }

  async openPanel() {
    await this.click(this.selectors.bell);
    await sleep(500);
  }

  async getNotifications() {
    await this.openPanel();
    const items = await this.driver.findElements(this.selectors.notificationItems);
    const texts = [];
    for (const item of items) {
      try { texts.push(await item.getText()); } catch { /* skip */ }
    }
    return texts;
  }

  async markAsRead(index) {
    const items = await this.driver.findElements(this.selectors.notificationItems);
    if (index >= items.length) return;
    await items[index].click();
    await sleep(400);
  }

  async markAllRead() {
    try { await this.click(this.selectors.markAllReadBtn); }
    catch { await this.click(this.selectors.markAllReadBtnText); }
    await sleep(500);
  }

  async isNotificationPresent(text) {
    const notifications = await this.getNotifications();
    return notifications.some(n => n.includes(text));
  }

  async getUnreadCount() {
    try {
      const items = await this.driver.findElements(this.selectors.unreadItem);
      return items.length;
    } catch { return 0; }
  }
}

module.exports = NotificationsPage;
