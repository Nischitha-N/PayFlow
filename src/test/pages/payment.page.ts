import { Page, Locator } from '@playwright/test';

export interface PaymentFormData {
  recipient: string;
  currency: string;
  amount: string;
  idempotencyKey?: string;
}

/**
 * Page Object representing the PayFlow Payment Dashboard.
 * Encapsulates UI locators and user actions.
 * Assertions are intentionally excluded here and kept within the test specs.
 */
export class PaymentPage {
  readonly page: Page;

  // Header and Auth Locators
  readonly apiKeyInput: Locator;
  readonly toggleApiKeyBtn: Locator;
  readonly authStatusBadge: Locator;

  // Form Locators
  readonly paymentForm: Locator;
  readonly recipientInput: Locator;
  readonly currencySelect: Locator;
  readonly amountInput: Locator;
  readonly idempotencyKeyInput: Locator;
  readonly generateIdempBtn: Locator;
  readonly submitBtn: Locator;
  readonly recipientError: Locator;
  readonly amountError: Locator;

  // Alerts and Feedback Locators
  readonly alertContainer: Locator;
  readonly alert: Locator;

  // Table and History Locators
  readonly transactionsTable: Locator;
  readonly transactionRows: Locator;
  readonly refreshBtn: Locator;
  readonly transactionCountBadge: Locator;
  readonly emptyStateCell: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header & Auth
    this.apiKeyInput = page.locator('#apiKeyInput');
    this.toggleApiKeyBtn = page.locator('#toggleApiKeyVisibility');
    this.authStatusBadge = page.locator('#authStatusBadge');

    // Form
    this.paymentForm = page.locator('#paymentForm');
    this.recipientInput = page.locator('#recipientInput');
    this.currencySelect = page.locator('#currencySelect');
    this.amountInput = page.locator('#amountInput');
    this.idempotencyKeyInput = page.locator('#idempotencyKeyInput');
    this.generateIdempBtn = page.locator('#generateIdempBtn');
    this.submitBtn = page.locator('#submitPaymentBtn');
    this.recipientError = page.locator('#recipientError');
    this.amountError = page.locator('#amountError');

    // Feedback
    this.alertContainer = page.locator('#alertContainer');
    this.alert = page.locator('#alertContainer .alert');

    // Table
    this.transactionsTable = page.locator('#transactionsTable');
    this.transactionRows = page.locator('tr[data-testid="transaction-row"]');
    this.refreshBtn = page.locator('#refreshBtn');
    this.transactionCountBadge = page.locator('#transactionCountBadge');
    this.emptyStateCell = page.locator('.empty-state');
  }

  /**
   * Navigates to the PayFlow dashboard home page.
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /**
   * Configures the in-memory API key in the dashboard header.
   */
  async setApiKey(key: string): Promise<void> {
    await this.apiKeyInput.fill(key);
  }

  async getAuthStatus(): Promise<string> {
    return (await this.authStatusBadge.textContent()) || '';
  }

  async setRecipient(recipient: string): Promise<void> {
    await this.recipientInput.fill(recipient);
  }

  async selectCurrency(currency: string): Promise<void> {
    await this.currencySelect.selectOption(currency);
  }

  async setAmount(amount: string): Promise<void> {
    await this.amountInput.fill(amount);
  }

  async setIdempotencyKey(key: string): Promise<void> {
    await this.idempotencyKeyInput.fill(key);
  }

  async clickGenerateIdempotencyKey(): Promise<void> {
    await this.generateIdempBtn.click();
  }

  async getIdempotencyKeyValue(): Promise<string> {
    return await this.idempotencyKeyInput.inputValue();
  }

  async submitPayment(): Promise<void> {
    await this.submitBtn.click();
  }

  /**
   * Fills and submits the payment form in a single user workflow.
   */
  async submitPaymentForm(data: PaymentFormData): Promise<void> {
    await this.setRecipient(data.recipient);
    await this.selectCurrency(data.currency);
    await this.setAmount(data.amount);
    if (data.idempotencyKey !== undefined) {
      await this.setIdempotencyKey(data.idempotencyKey);
    }
    await this.submitPayment();
  }

  async refreshTransactions(): Promise<void> {
    await this.refreshBtn.click();
  }

  async getAlertText(): Promise<string> {
    return (await this.alert.textContent()) || '';
  }

  async getRecipientError(): Promise<string> {
    return (await this.recipientError.textContent()) || '';
  }

  async getAmountError(): Promise<string> {
    return (await this.amountError.textContent()) || '';
  }

  async getTransactionRowCount(): Promise<number> {
    return await this.transactionRows.count();
  }

  getTransactionRowById(id: string): Locator {
    return this.page.locator(`tr[data-transaction-id="${id}"]`);
  }
}
