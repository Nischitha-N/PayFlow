import { test, expect } from '@playwright/test';
import { PaymentPage } from '../../pages/payment.page';
import { TEST_CONFIG } from '../../config/test-env';
import { generateUniqueRecipient, generateUniqueIdempotencyKey } from '../../support/test-data';

test.describe('PayFlow Web UI Automation Suite', () => {
  let paymentPage: PaymentPage;

  test.beforeEach(async ({ page }) => {
    paymentPage = new PaymentPage(page);
    await paymentPage.goto();
  });

  test('1. Dashboard loads successfully with expected controls', async () => {
    await expect(paymentPage.paymentForm).toBeVisible();
    await expect(paymentPage.transactionsTable).toBeVisible();
    await expect(paymentPage.apiKeyInput).toBeVisible();
    await expect(paymentPage.authStatusBadge).toHaveText('Key Not Set');
  });

  test('2. Payment form contains all required input fields and submit button', async () => {
    await expect(paymentPage.recipientInput).toBeVisible();
    await expect(paymentPage.currencySelect).toBeVisible();
    await expect(paymentPage.amountInput).toBeVisible();
    await expect(paymentPage.idempotencyKeyInput).toBeVisible();
    await expect(paymentPage.generateIdempBtn).toBeVisible();
    await expect(paymentPage.submitBtn).toBeVisible();
  });

  test('3 & 4. Valid payment submission displays success feedback banner', async () => {
    const recipient = generateUniqueRecipient('UI Client Corp');

    // Configure authentication in the dashboard header
    await paymentPage.setApiKey(TEST_CONFIG.apiKey);
    await expect(paymentPage.authStatusBadge).toHaveText('Configured');

    // Submit payment form
    await paymentPage.submitPaymentForm({
      recipient,
      currency: 'USD',
      amount: '29.95',
    });

    // Assert accessible success alert
    await expect(paymentPage.alert).toBeVisible();
    await expect(paymentPage.alert).toHaveClass(/alert-success/);
    const alertText = await paymentPage.getAlertText();
    expect(alertText).toContain('Payment successful!');
    expect(alertText).toContain('txn_');
  });

  test('5. Newly created payment appears in the transaction history table', async () => {
    const recipient = generateUniqueRecipient('History Customer');
    const amount = '54.20';

    await paymentPage.setApiKey(TEST_CONFIG.apiKey);
    await paymentPage.submitPaymentForm({
      recipient,
      currency: 'EUR',
      amount,
    });

    // Assert row exists in table
    await expect(paymentPage.alert).toBeVisible();
    const row = paymentPage.page.locator('tr[data-testid="transaction-row"]', {
      hasText: recipient,
    });
    await expect(row).toBeVisible();
    await expect(row).toContainText(amount);
    await expect(row).toContainText('EUR');
    await expect(row).toContainText('COMPLETED');
  });

  test('6. Invalid or empty amount produces client validation error', async () => {
    await paymentPage.setApiKey(TEST_CONFIG.apiKey);

    // Leave amount empty
    await paymentPage.setRecipient('Test Recipient');
    await paymentPage.setAmount('');
    await paymentPage.submitPayment();

    await expect(paymentPage.amountError).toHaveText(/Please enter a payment amount/);

    // Enter invalid negative or malformed amount
    await paymentPage.setAmount('-15.00');
    await paymentPage.submitPayment();
    await expect(paymentPage.amountError).toHaveText(/Amount must be a positive number/);
  });

  test('7. Invalid API key produces an authentication error alert', async () => {
    await paymentPage.setApiKey('wrong_invalid_key_789');
    await paymentPage.submitPaymentForm({
      recipient: generateUniqueRecipient('Auth Fail'),
      currency: 'USD',
      amount: '10.00',
    });

    await expect(paymentPage.alert).toBeVisible();
    await expect(paymentPage.alert).toHaveClass(/alert-error/);
    await expect(paymentPage.alert).toContainText('Authentication failed');
  });

  test('8. Transaction history can be manually refreshed', async () => {
    await paymentPage.setApiKey(TEST_CONFIG.apiKey);
    await paymentPage.refreshTransactions();

    // Table should render without error
    await expect(paymentPage.transactionsTable).toBeVisible();
  });

  test('9. Idempotency key can be generated and entered in form', async () => {
    await paymentPage.clickGenerateIdempotencyKey();
    const generatedKey = await paymentPage.getIdempotencyKeyValue();
    expect(generatedKey).toMatch(/^idemp_\d+_[a-z0-9]+$/);

    // Custom key entry
    const customKey = generateUniqueIdempotencyKey('custom_ui');
    await paymentPage.setIdempotencyKey(customKey);
    expect(await paymentPage.getIdempotencyKeyValue()).toBe(customKey);
  });

  test('10. Failed payment request does not incorrectly appear in history', async () => {
    await paymentPage.setApiKey(TEST_CONFIG.apiKey);
    const initialCount = await paymentPage.getTransactionRowCount();

    // Submit invalid form with empty recipient
    await paymentPage.setRecipient('');
    await paymentPage.setAmount('10.00');
    await paymentPage.submitPayment();

    // Assert validation error stopped submission
    await expect(paymentPage.recipientError).toHaveText(/Recipient is required/);

    // Confirm table count did not change
    const newCount = await paymentPage.getTransactionRowCount();
    expect(newCount).toBe(initialCount);
  });
});
