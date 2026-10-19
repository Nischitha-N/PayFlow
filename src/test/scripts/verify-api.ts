import fs from 'fs';
import path from 'path';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../../app/app';
import { getDatabase, closeDatabase } from '../../app/db/connection';
import { PaymentService } from '../../app/services/payment.service';

const TEST_DB_PATH = path.resolve(process.cwd(), 'data', 'payflow.verify-api.test.db');
const TEST_API_KEY = 'verify_api_key_secret_123';

process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.API_KEY = TEST_API_KEY;

function cleanupTestDb(): void {
  const filesToDelete = [
    TEST_DB_PATH,
    `${TEST_DB_PATH}-wal`,
    `${TEST_DB_PATH}-shm`,
  ];
  for (const file of filesToDelete) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Ignore file lock release delays if any
      }
    }
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

async function runApiVerification(): Promise<void> {
  console.log('--- Starting PayFlow Express REST API Verification ---');
  console.log(`Using isolated test database: ${TEST_DB_PATH}`);

  cleanupTestDb();

  const db = getDatabase(TEST_DB_PATH);
  const paymentService = new PaymentService(db);
  const app = createApp({ paymentService });

  let server: Server;
  let baseUrl = '';

  await new Promise<void>((resolve) => {
    // Port 0 lets the OS pick an available ephemeral port
    server = app.listen(0, () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://localhost:${address.port}`;
      console.log(`Real Express server listening for tests on ${baseUrl}`);
      resolve();
    });
  });

  try {
    // 1. Health check (unauthenticated)
    console.log('\n[Check 1] GET /health (unauthenticated)');
    const healthRes = await fetch(`${baseUrl}/health`);
    assert(healthRes.status === 200, `Expected 200, got ${healthRes.status}`);
    const healthBody = (await healthRes.json()) as { status: string };
    assert(healthBody.status === 'ok', "Health body status should be 'ok'");
    console.log('✓ Health check passed');

    // 2. Auth: Missing x-api-key header
    console.log('\n[Check 2] POST /api/payments without x-api-key header');
    const noAuthRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountMinor: 1000, currency: 'USD', recipient: 'Alice' }),
    });
    assert(noAuthRes.status === 401, `Expected 401 Unauthorized, got ${noAuthRes.status}`);
    const noAuthBody = (await noAuthRes.json()) as { error: { code: string } };
    assert(noAuthBody.error.code === 'UNAUTHORIZED', 'Error code should be UNAUTHORIZED');
    console.log('✓ Missing API key rejected with 401 UNAUTHORIZED');

    // 3. Auth: Invalid x-api-key header
    console.log('\n[Check 3] POST /api/payments with invalid x-api-key');
    const invalidAuthRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'wrong_key_123',
      },
      body: JSON.stringify({ amountMinor: 1000, currency: 'USD', recipient: 'Alice' }),
    });
    assert(invalidAuthRes.status === 401, `Expected 401, got ${invalidAuthRes.status}`);
    console.log('✓ Invalid API key rejected with 401');

    // 4. Bad Request: Malformed JSON syntax
    console.log('\n[Check 4] POST /api/payments with malformed JSON body');
    const malformedJsonRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: '{"amountMinor": 1000, "broken": ',
    });
    assert(malformedJsonRes.status === 400, `Expected 400 Bad Request, got ${malformedJsonRes.status}`);
    const malformedBody = (await malformedJsonRes.json()) as { error: { code: string } };
    assert(malformedBody.error.code === 'BAD_REQUEST', 'Error code should be BAD_REQUEST');
    console.log('✓ Malformed JSON rejected with 400 BAD_REQUEST');

    // 5. Bad Request: Array body instead of object
    console.log('\n[Check 5] POST /api/payments with array body');
    const arrayBodyRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: JSON.stringify([1, 2, 3]),
    });
    assert(arrayBodyRes.status === 400, `Expected 400 Bad Request, got ${arrayBodyRes.status}`);
    console.log('✓ Non-object payload rejected with 400 BAD_REQUEST');

    // 6. Validation: Invalid amount variations (negative, zero, float, missing) -> 422
    console.log('\n[Check 6] POST /api/payments with invalid amounts (422 Unprocessable Entity)');
    const badAmounts = [-1000, 0, 19.99];
    for (const badAmount of badAmounts) {
      const res = await fetch(`${baseUrl}/api/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY,
        },
        body: JSON.stringify({
          amountMinor: badAmount,
          currency: 'USD',
          recipient: 'Alice',
        }),
      });
      assert(res.status === 422, `Amount ${badAmount} should return 422, got ${res.status}`);
    }
    console.log('✓ Invalid amount formats returned 422 Unprocessable Entity');

    // 7. Validation: Unsupported currency -> 422
    console.log('\n[Check 7] POST /api/payments with unsupported currency (422)');
    const badCurrencyRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: JSON.stringify({
        amountMinor: 2500,
        currency: 'CAD',
        recipient: 'Bob',
      }),
    });
    assert(badCurrencyRes.status === 422, `Expected 422, got ${badCurrencyRes.status}`);
    const badCurrencyBody = (await badCurrencyRes.json()) as { error: { code: string } };
    assert(badCurrencyBody.error.code === 'UNSUPPORTED_CURRENCY', 'Expected UNSUPPORTED_CURRENCY');
    console.log('✓ Unsupported currency returned 422 UNSUPPORTED_CURRENCY');

    // 8. Validation: Empty recipient -> 422
    console.log('\n[Check 8] POST /api/payments with whitespace recipient (422)');
    const emptyRecipientRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: JSON.stringify({
        amountMinor: 2500,
        currency: 'USD',
        recipient: '   ',
      }),
    });
    assert(emptyRecipientRes.status === 422, `Expected 422, got ${emptyRecipientRes.status}`);
    console.log('✓ Whitespace recipient returned 422');

    // 9. Success: Create new payment -> 201 Created
    console.log('\n[Check 9] POST /api/payments creating new payment (201 Created)');
    const createRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
        'x-idempotency-key': 'api_test_idemp_001',
      },
      body: JSON.stringify({
        amountMinor: 4999, // $49.99
        currency: 'USD',
        recipient: 'Global Tech Ltd',
      }),
    });
    assert(createRes.status === 201, `Expected 201 Created, got ${createRes.status}`);
    const createdData = (await createRes.json()) as {
      data: { id: string; amountMinor: number; currency: string; status: string; recipient: string };
    };
    const createdId = createdData.data.id;
    assert(createdId.startsWith('txn_'), 'ID should start with txn_');
    assert(createdData.data.amountMinor === 4999, 'amountMinor should be 4999');
    assert(createdData.data.status === 'COMPLETED', 'status should be COMPLETED');
    console.log('✓ Successfully created payment with 201 Created:', createdId);

    // 10. Idempotency Replay: Same key & identical payload -> 200 OK
    console.log('\n[Check 10] POST /api/payments idempotent replay (200 OK)');
    const replayRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
        'x-idempotency-key': 'api_test_idemp_001',
      },
      body: JSON.stringify({
        amountMinor: 4999,
        currency: 'USD',
        recipient: 'Global Tech Ltd',
      }),
    });
    assert(replayRes.status === 200, `Expected 200 OK for replay, got ${replayRes.status}`);
    const replayData = (await replayRes.json()) as { data: { id: string } };
    assert(replayData.data.id === createdId, 'Replayed transaction ID must match original');
    console.log('✓ Idempotent replay returned 200 OK with original transaction');

    // 11. Idempotency Conflict: Same key & differing payload -> 409 Conflict
    console.log('\n[Check 11] POST /api/payments idempotency conflict (409 Conflict)');
    const conflictRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
        'x-idempotency-key': 'api_test_idemp_001',
      },
      body: JSON.stringify({
        amountMinor: 8500, // Different amount
        currency: 'USD',
        recipient: 'Global Tech Ltd',
      }),
    });
    assert(conflictRes.status === 409, `Expected 409 Conflict, got ${conflictRes.status}`);
    const conflictBody = (await conflictRes.json()) as { error: { code: string } };
    assert(conflictBody.error.code === 'IDEMPOTENCY_CONFLICT', 'Error code must be IDEMPOTENCY_CONFLICT');
    console.log('✓ Idempotency conflict returned 409 IDEMPOTENCY_CONFLICT');

    // 12. GET /api/payments/:id (Success) -> 200 OK
    console.log('\n[Check 12] GET /api/payments/:id with existing ID (200 OK)');
    const getByIdRes = await fetch(`${baseUrl}/api/payments/${createdId}`, {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    assert(getByIdRes.status === 200, `Expected 200 OK, got ${getByIdRes.status}`);
    const fetchedData = (await getByIdRes.json()) as { data: { id: string } };
    assert(fetchedData.data.id === createdId, 'Fetched ID should match');
    console.log('✓ Retrieved transaction by ID returned 200 OK');

    // 13. GET /api/payments/:id (Not Found) -> 404 Not Found
    console.log('\n[Check 13] GET /api/payments/:id with non-existent ID (404 Not Found)');
    const notFoundRes = await fetch(`${baseUrl}/api/payments/txn_non_existent_999`, {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    assert(notFoundRes.status === 404, `Expected 404 Not Found, got ${notFoundRes.status}`);
    const notFoundBody = (await notFoundRes.json()) as { error: { code: string } };
    assert(notFoundBody.error.code === 'TRANSACTION_NOT_FOUND', 'Expected TRANSACTION_NOT_FOUND');
    console.log('✓ Unknown transaction returned 404 TRANSACTION_NOT_FOUND');

    // 14. GET /api/payments -> 200 OK
    console.log('\n[Check 14] GET /api/payments listing (200 OK)');
    const listRes = await fetch(`${baseUrl}/api/payments`, {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    assert(listRes.status === 200, `Expected 200 OK, got ${listRes.status}`);
    const listBody = (await listRes.json()) as { data: Array<{ id: string }> };
    assert(Array.isArray(listBody.data), 'Response data should be an array');
    assert(listBody.data.length >= 1, 'List should contain at least 1 transaction');
    assert(listBody.data[0].id === createdId, 'Most recent item should match created transaction');
    console.log('✓ List payments returned 200 OK with transactions array');

    console.log('\n=========================================');
    console.log('All Express REST API checks passed! (14/14)');
    console.log('=========================================');
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        closeDatabase(db);
        cleanupTestDb();
        console.log('Server closed and test database artifacts cleaned up.');
        resolve();
      });
    });
  }
}

runApiVerification().catch((err) => {
  console.error('\nAPI Verification failed:', err);
  process.exit(1);
});
