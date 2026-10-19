import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from '../../config/test-env';
import {
  generateUniqueRecipient,
  generateUniqueIdempotencyKey,
  createValidPaymentPayload,
} from '../../support/test-data';
import { getDbTransactionById } from '../../db/db-assert';

test.describe('PayFlow REST API Automation Suite', () => {
  const validHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': TEST_CONFIG.apiKey,
  };

  test('1. Create valid payment returns 201 and completed transaction structure', async ({ request }) => {
    const payload = createValidPaymentPayload({
      amountMinor: 2500,
      currency: 'USD',
      recipient: generateUniqueRecipient('Stripe Partner'),
    });

    const response = await request.post('/api/payments', {
      headers: validHeaders,
      data: payload,
    });

    expect(response.status()).toBe(201);
    const body = await response.json();

    expect(body).toHaveProperty('data');
    const txn = body.data;
    expect(txn.id).toMatch(/^txn_[a-f0-9-]+$/i);
    expect(txn.amountMinor).toBe(2500);
    expect(txn.currency).toBe('USD');
    expect(txn.recipient).toBe(payload.recipient);
    expect(txn.status).toBe('COMPLETED');
    expect(txn.createdAt).toBeTruthy();
  });

  test('2. Retrieve existing payment by ID returns 200 and matches created record', async ({ request }) => {
    // Arrange: Create a transaction
    const createPayload = createValidPaymentPayload({
      amountMinor: 1575,
      currency: 'EUR',
      recipient: generateUniqueRecipient('Euro Merchant'),
    });

    const createRes = await request.post('/api/payments', {
      headers: validHeaders,
      data: createPayload,
    });
    expect(createRes.status()).toBe(201);
    const createdId = (await createRes.json()).data.id;

    // Act: Retrieve by ID
    const getRes = await request.get(`/api/payments/${createdId}`, {
      headers: validHeaders,
    });

    // Assert
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.id).toBe(createdId);
    expect(getBody.data.amountMinor).toBe(1575);
    expect(getBody.data.currency).toBe('EUR');
    expect(getBody.data.recipient).toBe(createPayload.recipient);
    expect(getBody.data.status).toBe('COMPLETED');
  });

  test('3. List payments returns 200 and includes newly created transaction', async ({ request }) => {
    const payload = createValidPaymentPayload({
      amountMinor: 8900,
      currency: 'INR',
      recipient: generateUniqueRecipient('Mumbai Books'),
    });

    const createRes = await request.post('/api/payments', {
      headers: validHeaders,
      data: payload,
    });
    const createdId = (await createRes.json()).data.id;

    const listRes = await request.get('/api/payments', {
      headers: validHeaders,
    });

    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(Array.isArray(listBody.data)).toBe(true);

    const found = listBody.data.find((item: { id: string }) => item.id === createdId);
    expect(found).toBeDefined();
    expect(found.amountMinor).toBe(8900);
    expect(found.currency).toBe('INR');
  });

  test('4. Missing API key returns 401 UNAUTHORIZED', async ({ request }) => {
    const payload = createValidPaymentPayload();

    const response = await request.post('/api/payments', {
      headers: { 'Content-Type': 'application/json' }, // No x-api-key header
      data: payload,
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('5. Invalid API key returns 401 UNAUTHORIZED', async ({ request }) => {
    const payload = createValidPaymentPayload();

    const response = await request.post('/api/payments', {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'incorrect_dummy_key_999',
      },
      data: payload,
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('6. Invalid amount values (zero, negative, float, missing) return 422', async ({ request }) => {
    const testCases = [
      { amount: 0, label: 'zero' },
      { amount: -500, label: 'negative' },
      { amount: 15.99, label: 'floating-point' },
      { amount: undefined, label: 'missing' },
    ];

    for (const { amount } of testCases) {
      const response = await request.post('/api/payments', {
        headers: validHeaders,
        data: {
          recipient: 'Sample Merchant',
          currency: 'USD',
          amountMinor: amount,
        },
      });

      expect(response.status()).toBe(422);
      const body = await response.json();
      expect(['MISSING_AMOUNT', 'INVALID_AMOUNT_FORMAT', 'INVALID_AMOUNT_VALUE']).toContain(
        body.error.code
      );
    }
  });

  test('7. Unsupported currency returns 422 UNSUPPORTED_CURRENCY', async ({ request }) => {
    const response = await request.post('/api/payments', {
      headers: validHeaders,
      data: {
        recipient: 'Tokyo Express',
        currency: 'JPY', // Unsupported
        amountMinor: 1000,
      },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('UNSUPPORTED_CURRENCY');
  });

  test('8. Empty or whitespace recipient returns 422 INVALID_RECIPIENT', async ({ request }) => {
    const response = await request.post('/api/payments', {
      headers: validHeaders,
      data: {
        recipient: '   ',
        currency: 'USD',
        amountMinor: 1000,
      },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_RECIPIENT');
  });

  test('9. Unknown transaction ID returns 404 TRANSACTION_NOT_FOUND', async ({ request }) => {
    const response = await request.get('/api/payments/txn_non_existent_uuid_000', {
      headers: validHeaders,
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('TRANSACTION_NOT_FOUND');
  });

  test('10. Idempotent replay returns 200 with identical transaction ID', async ({ request }) => {
    const idempotencyKey = generateUniqueIdempotencyKey('replay');
    const payload = createValidPaymentPayload({
      amountMinor: 3000,
      currency: 'USD',
      recipient: generateUniqueRecipient('Idempotent Shop'),
      idempotencyKey,
    });

    // First submission: 201 Created
    const firstRes = await request.post('/api/payments', {
      headers: {
        ...validHeaders,
        'x-idempotency-key': idempotencyKey,
      },
      data: payload,
    });
    expect(firstRes.status()).toBe(201);
    const firstId = (await firstRes.json()).data.id;

    // Second submission with exact same key & payload: 200 OK
    const secondRes = await request.post('/api/payments', {
      headers: {
        ...validHeaders,
        'x-idempotency-key': idempotencyKey,
      },
      data: payload,
    });
    expect(secondRes.status()).toBe(200);
    const secondId = (await secondRes.json()).data.id;

    expect(secondId).toBe(firstId);
  });

  test('11. Idempotency conflict returns 409 IDEMPOTENCY_CONFLICT when payload differs', async ({ request }) => {
    const idempotencyKey = generateUniqueIdempotencyKey('conflict');
    const originalPayload = createValidPaymentPayload({
      amountMinor: 2000,
      currency: 'USD',
      recipient: generateUniqueRecipient('Original Recipient'),
      idempotencyKey,
    });

    // First submission: 201 Created
    const firstRes = await request.post('/api/payments', {
      headers: {
        ...validHeaders,
        'x-idempotency-key': idempotencyKey,
      },
      data: originalPayload,
    });
    expect(firstRes.status()).toBe(201);

    // Second submission with same key but DIFFERENT amount (5000 vs 2000)
    const conflictingRes = await request.post('/api/payments', {
      headers: {
        ...validHeaders,
        'x-idempotency-key': idempotencyKey,
      },
      data: {
        ...originalPayload,
        amountMinor: 5000, // Conflict!
      },
    });

    expect(conflictingRes.status()).toBe(409);
    const conflictBody = await conflictingRes.json();
    expect(conflictBody.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  test('12. End-to-end database consistency: HTTP response matches SQLite row', async ({ request }) => {
    const payload = createValidPaymentPayload({
      amountMinor: 6750, // 67.50
      currency: 'INR',
      recipient: generateUniqueRecipient('Database Verified Ltd'),
    });

    // 1. Send HTTP POST to create payment
    const response = await request.post('/api/payments', {
      headers: validHeaders,
      data: payload,
    });
    expect(response.status()).toBe(201);
    const apiTxn = (await response.json()).data;

    // 2. Query SQLite database directly via db-assert helper
    const dbRecord = getDbTransactionById(apiTxn.id);
    expect(dbRecord).not.toBeNull();

    // 3. Assert full database consistency
    expect(dbRecord?.id).toBe(apiTxn.id);
    expect(dbRecord?.amount_minor).toBe(payload.amountMinor);
    expect(dbRecord?.currency).toBe(payload.currency);
    expect(dbRecord?.recipient).toBe(payload.recipient);
    expect(dbRecord?.status).toBe('COMPLETED');
  });
});
