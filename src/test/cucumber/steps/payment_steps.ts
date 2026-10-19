import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';
import { CustomWorld } from '../support/world';
import { TEST_CONFIG } from '../../config/test-env';
import {
  generateUniqueRecipient,
  generateUniqueIdempotencyKey,
} from '../../support/test-data';
import { getDbTransactionById } from '../../db/db-assert';

Given('I am authenticated with a valid API key', function (this: CustomWorld) {
  this.apiKey = TEST_CONFIG.apiKey;
  assert.ok(this.apiKey, 'API key must be configured');
});

When(
  'I submit a payment for {string} with {int} {string}',
  async function (this: CustomWorld, recipient: string, amount: number, currency: string) {
    const uniqueRecipient = generateUniqueRecipient(recipient);
    const response = await fetch(`${TEST_CONFIG.baseURL}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        recipient: uniqueRecipient,
        amountMinor: amount,
        currency: currency,
      }),
    });

    const body = await response.json();
    this.lastResponse = { status: response.status, body };
    if (response.status === 201) {
      this.originalPayment = {
        id: body.data.id,
        amountMinor: amount,
        currency,
        recipient: uniqueRecipient,
      };
    }
  }
);

Then(
  'the payment should be processed successfully with status {string}',
  function (this: CustomWorld, expectedStatus: string) {
    assert.ok(this.lastResponse, 'A response must exist');
    assert.strictEqual(this.lastResponse.status, 201, `Expected status 201, got ${this.lastResponse.status}`);
    assert.strictEqual(this.lastResponse.body.data.status, expectedStatus);
    assert.ok(this.lastResponse.body.data.id.startsWith('txn_'), 'Transaction ID should start with txn_');
  }
);

Then(
  'the transaction record in the database should match the payment details',
  function (this: CustomWorld) {
    assert.ok(this.originalPayment, 'Original payment context must be set');
    const dbRecord = getDbTransactionById(this.originalPayment.id);
    assert.ok(dbRecord, `Transaction ${this.originalPayment.id} not found in database`);
    assert.strictEqual(dbRecord.amount_minor, this.originalPayment.amountMinor);
    assert.strictEqual(dbRecord.currency, this.originalPayment.currency);
    assert.strictEqual(dbRecord.recipient, this.originalPayment.recipient);
    assert.strictEqual(dbRecord.status, 'COMPLETED');
  }
);

When(
  'I submit a payment for {string} with an invalid amount {int} {string}',
  async function (this: CustomWorld, recipient: string, amount: number, currency: string) {
    const response = await fetch(`${TEST_CONFIG.baseURL}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        recipient: generateUniqueRecipient(recipient),
        amountMinor: amount,
        currency: currency,
      }),
    });

    const body = await response.json();
    this.lastResponse = { status: response.status, body };
  }
);

Then(
  'the payment request should be rejected with status {int}',
  function (this: CustomWorld, expectedStatus: number) {
    assert.ok(this.lastResponse, 'Response must exist');
    assert.strictEqual(this.lastResponse.status, expectedStatus);
  }
);

Then(
  'the error code should be {string}',
  function (this: CustomWorld, expectedCode: string) {
    assert.ok(this.lastResponse?.body?.error, 'Response error object must be present');
    assert.strictEqual(this.lastResponse.body.error.code, expectedCode);
  }
);

Given(
  'a payment transaction exists for {string} with {int} {string} and an idempotency key',
  async function (this: CustomWorld, recipient: string, amount: number, currency: string) {
    const idempotencyKey = generateUniqueIdempotencyKey('bdd_replay');
    const uniqueRecipient = generateUniqueRecipient(recipient);

    const response = await fetch(`${TEST_CONFIG.baseURL}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        recipient: uniqueRecipient,
        amountMinor: amount,
        currency: currency,
      }),
    });

    assert.strictEqual(response.status, 201, 'Baseline payment creation failed');
    const body = await response.json();

    this.originalPayment = {
      id: body.data.id,
      amountMinor: amount,
      currency,
      recipient: uniqueRecipient,
      idempotencyKey,
    };
  }
);

When(
  'I submit an identical payment request using the same idempotency key',
  async function (this: CustomWorld) {
    assert.ok(this.originalPayment?.idempotencyKey, 'Original idempotency key missing');

    const response = await fetch(`${TEST_CONFIG.baseURL}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'x-idempotency-key': this.originalPayment.idempotencyKey,
      },
      body: JSON.stringify({
        recipient: this.originalPayment.recipient,
        amountMinor: this.originalPayment.amountMinor,
        currency: this.originalPayment.currency,
      }),
    });

    const body = await response.json();
    this.lastResponse = { status: response.status, body };
  }
);

Then(
  'the response should return status {int}',
  function (this: CustomWorld, expectedStatus: number) {
    assert.ok(this.lastResponse, 'Response must exist');
    assert.strictEqual(this.lastResponse.status, expectedStatus);
  }
);

Then(
  'the returned transaction ID should match the original transaction',
  function (this: CustomWorld) {
    assert.ok(this.originalPayment, 'Original transaction context required');
    assert.strictEqual(this.lastResponse?.body?.data?.id, this.originalPayment.id);
  }
);

When(
  'I submit a payment with the same idempotency key but amount {int} {string}',
  async function (this: CustomWorld, newAmount: number, currency: string) {
    assert.ok(this.originalPayment?.idempotencyKey, 'Original idempotency key required');

    const response = await fetch(`${TEST_CONFIG.baseURL}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'x-idempotency-key': this.originalPayment.idempotencyKey,
      },
      body: JSON.stringify({
        recipient: this.originalPayment.recipient,
        amountMinor: newAmount,
        currency: currency,
      }),
    });

    const body = await response.json();
    this.lastResponse = { status: response.status, body };
  }
);

Given(
  'a payment transaction exists for {string} with {int} {string}',
  async function (this: CustomWorld, recipient: string, amount: number, currency: string) {
    const uniqueRecipient = generateUniqueRecipient(recipient);
    const response = await fetch(`${TEST_CONFIG.baseURL}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        recipient: uniqueRecipient,
        amountMinor: amount,
        currency: currency,
      }),
    });

    assert.strictEqual(response.status, 201, 'Baseline payment creation failed');
    const body = await response.json();

    this.originalPayment = {
      id: body.data.id,
      amountMinor: amount,
      currency,
      recipient: uniqueRecipient,
    };
  }
);

When('I retrieve the transaction by its ID', async function (this: CustomWorld) {
  assert.ok(this.originalPayment?.id, 'Original transaction ID required');

  const response = await fetch(`${TEST_CONFIG.baseURL}/api/payments/${this.originalPayment.id}`, {
    headers: {
      'x-api-key': this.apiKey,
    },
  });

  const body = await response.json();
  this.lastResponse = { status: response.status, body };
});

Then(
  'the retrieved transaction recipient should be {string}',
  function (this: CustomWorld, expectedRecipient: string) {
    assert.ok(this.lastResponse?.body?.data, 'Transaction data must exist');
    assert.ok(
      this.lastResponse.body.data.recipient.startsWith(expectedRecipient),
      `Expected recipient starting with ${expectedRecipient}, got ${this.lastResponse.body.data.recipient}`
    );
  }
);

Then(
  'the retrieved amount should be {int}',
  function (this: CustomWorld, expectedAmount: number) {
    assert.ok(this.lastResponse?.body?.data, 'Transaction data must exist');
    assert.strictEqual(this.lastResponse.body.data.amountMinor, expectedAmount);
  }
);
