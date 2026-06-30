'use strict';
const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { sleep, waitForElement } = require('../helpers/WaitHelper');

class HistoricalDataPage extends BasePage {
  constructor(driver) {
    super(driver);
    this.selectors = {
      searchInput: By.css('[data-testid="search-input"], input[placeholder*="search" i]'),
      complexityFilter: By.css('[data-testid="complexity-filter"], select[name="complexity"]'),
      statusFilter: By.css('[data-testid="status-filter"], select[name="status"]'),
      riskFilter: By.css('[data-testid="risk-filter"], select[name="risk"]'),
      sortHeaders: By.css('th[data-sort], th.sortable, [data-testid="sort-header"]'),
      tableRows: By.css('table tbody tr, [data-testid="history-row"]'),
      tableBody: By.css('table tbody'),
      exportCsvBtn: By.css('[data-testid="export-csv-btn"]'),
      exportCsvBtnText: By.xpath('//button[contains(text(),"Export CSV") or contains(text(),"Export") or contains(text(),"Download CSV")]'),
      importExcelBtn: By.css('[data-testid="import-excel-btn"]'),
      importExcelBtnText: By.xpath('//button[contains(text(),"Import") or contains(text(),"Import Excel")]'),
      fileInput: By.css('input[type="file"]'),
      paginationNext: By.css('[data-testid="pagination-next"], .pagination-next, [aria-label="Next page"]'),
      paginationPrev: By.css('[data-testid="pagination-prev"], .pagination-prev'),
      paginationInfo: By.css('[data-testid="pagination-info"], .pagination-info'),
      clearFiltersBtn: By.css('[data-testid="clear-filters"], .clear-filters-btn'),
      noDataMessage: By.css('[data-testid="no-data"], .empty-state'),
    };
  }

  async navigate() {
    await super.navigate('/historical');
    await this.waitForPageLoad();
    await sleep(500);
  }

  async search(term) {
    const input = await waitForElement(this.driver, this.selectors.searchInput);
    await input.clear();
    await input.sendKeys(term);
    await sleep(800);
  }

  async filterByComplexity(value) {
    try { await this.selectByText(this.selectors.complexityFilter, value); }
    catch { /* custom filter */ }
    await sleep(600);
  }

  async filterByStatus(value) {
    try { await this.selectByText(this.selectors.statusFilter, value); }
    catch { /* custom filter */ }
    await sleep(600);
  }

  async sortByColumn(headerText) {
    const header = By.xpath(`//th[contains(text(),"${headerText}")]`);
    await this.click(header);
    await sleep(600);
  }

  async getRowCount() {
    const rows = await this.driver.findElements(this.selectors.tableRows);
    return rows.length;
  }

  async exportCsv() {
    try { await this.click(this.selectors.exportCsvBtn); }
    catch { await this.click(this.selectors.exportCsvBtnText); }
    await sleep(2000);
  }

  async clickImportExcel() {
    try { await this.click(this.selectors.importExcelBtn); }
    catch { await this.click(this.selectors.importExcelBtnText); }
    await sleep(500);
  }

  async uploadFile(filePath) {
    const fileInput = await this.driver.findElement(this.selectors.fileInput);
    await fileInput.sendKeys(filePath);
    await sleep(1000);
  }

  async clearFilters() {
    try { await this.click(this.selectors.clearFiltersBtn); await sleep(600); }
    catch { /* no clear button — reload page */ }
  }

  async getPaginationInfo() {
    try { return await this.getText(this.selectors.paginationInfo); }
    catch { return ''; }
  }

  async goToNextPage() {
    await this.click(this.selectors.paginationNext);
    await sleep(800);
  }

  async getRowData(index) {
    const rows = await this.driver.findElements(this.selectors.tableRows);
    if (index >= rows.length) return null;
    return rows[index].getText();
  }

  async isEmptyStateVisible() {
    return this.isVisible(this.selectors.noDataMessage);
  }
}

module.exports = HistoricalDataPage;
