import fs from 'fs';
import path from 'path';
import { getDatabase, closeDatabase } from '../../app/db/connection';
import {
  PaymentService,
  ValidationError,
  IdempotencyConflictError,
} from '../../app/services/payment.service';
import { CreatePaymentPayload, SupportedCurrency } from '../../app/types';

// Ensure the verification script strictly uses an isolated database path
const TEST_DB_PATH = path.resolve(process.cwd(), 'data', 'payflow.verify-db.test.db');
process.env.DATABASE_PATH = TEST_DB_PATH;

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

async function runDatabaseVerification(): Promise<void> {
  console.log('--- Starting PayFlow Database & Service Verification ---');
  console.log(`Using isolated test database: ${TEST_DB_PATH}`);

  // Clean any previous artifacts before starting
  cleanupTestDb();

  const db = getDatabase(TEST_DB_PATH);
  const service = new PaymentService(db);

  try {
    // 1. Create a valid payment transaction
    console.log('\n[Test 1] Create valid payment transaction with integer minor units');
    const validPayload: CreatePaymentPayload = {
      amountMinor: 2550, // $25.50
      currency: 'USD',
      recipient: 'Acme Corp',
      idempotencyKey: 'idemp_test_key_001',
    };

    const result1 = service.createPayment(validPayload);
    assert(!result1.isExisting, 'Newly created payment should not be marked as existing');
    assert(result1.transaction.amountMinor === 2550, 'amountMinor should be 2550');
    assert(result1.transaction.currency === 'USD', 'currency should be USD');
    assert(result1.transaction.recipient === 'Acme Corp', 'recipient should match');
    assert(result1.transaction.status === 'COMPLETED', 'status should be COMPLETED');
    assert(result1.transaction.id.startsWith('txn_'), 'transaction id should start with txn_');
    assert(typeof result1.transaction.createdAt === 'string', 'createdAt should be set');
    console.log('✓ Created transaction successfully:', result1.transaction.id);

    // 2. Retrieve payment by ID
    console.log('\n[Test 2] Retrieve transaction by ID');
    const fetched = service.getPaymentById(result1.transaction.id);
    assert(fetched !== null, 'Fetched transaction should not be null');
    assert(fetched?.id === result1.transaction.id, 'Fetched ID should match');
    assert(fetched?.amountMinor === 2550, 'Fetched amountMinor should be 2550');
    assert(fetched?.idempotencyKey === 'idemp_test_key_001', 'Fetched idempotency key should match');
    console.log('✓ Successfully retrieved transaction by ID');

    // 3. List transactions
    console.log('\n[Test 3] List transactions');
    const list = service.listPayments();
    assert(list.length === 1, `Expected 1 transaction in list, found ${list.length}`);
    assert(list[0].id === result1.transaction.id, 'Listed item should match created transaction');
    console.log('✓ Transaction correctly listed');

    // 4. Idempotency: exact duplicate submission
    console.log('\n[Test 4] Duplicate submission with same idempotency key and same payload');
    const resultDuplicate = service.createPayment(validPayload);
    assert(resultDuplicate.isExisting === true, 'Duplicate submission must return isExisting = true');
    assert(resultDuplicate.transaction.id === result1.transaction.id, 'Must return the original transaction record');
    console.log('✓ Idempotent replay returned existing transaction ID:', resultDuplicate.transaction.id);

    // 5. Idempotency: reuse key with different payload (conflict)
    console.log('\n[Test 5] Reusing idempotency key with different payload (conflict check)');
    let conflictCaught = false;
    try {
      service.createPayment({
        amountMinor: 5000, // Different amount!
        currency: 'USD',
        recipient: 'Acme Corp',
        idempotencyKey: 'idemp_test_key_001',
      });
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        conflictCaught = true;
        assert(err.code === 'IDEMPOTENCY_CONFLICT', 'Error code must be IDEMPOTENCY_CONFLICT');
      }
    }
    assert(conflictCaught, 'Reusing idempotency key with different amount must throw IdempotencyConflictError');
    console.log('✓ Idempotency conflict detected and rejected appropriately');

    // 6. Validation: Invalid amounts
    console.log('\n[Test 6] Negative, zero, floating-point, and missing amounts');
    const invalidAmounts = [-100, 0, 10.5, NaN, null as unknown as number];
    for (const badAmount of invalidAmounts) {
      let rejected = false;
      try {
        service.createPayment({
          amountMinor: badAmount,
          currency: 'USD',
          recipient: 'John Doe',
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          rejected = true;
        }
      }
      assert(rejected, `Amount value '${badAmount}' should have been rejected with ValidationError`);
    }
    console.log('✓ Invalid amount formats rejected correctly');

    // 7. Validation: Unsupported currencies
    console.log('\n[Test 7] Unsupported currency check');
    let currencyRejected = false;
    try {
      service.createPayment({
        amountMinor: 1000,
        currency: 'JPY' as SupportedCurrency,
        recipient: 'Tokyo Store',
      });
    } catch (err) {
      if (err instanceof ValidationError && err.code === 'UNSUPPORTED_CURRENCY') {
        currencyRejected = true;
      }
    }
    assert(currencyRejected, "Unsupported currency 'JPY' should have been rejected");
    console.log('✓ Unsupported currency rejected correctly');

    // 8. Validation: Empty recipient
    console.log('\n[Test 8] Empty/whitespace recipient check');
    let recipientRejected = false;
    try {
      service.createPayment({
        amountMinor: 1000,
        currency: 'EUR',
        recipient: '   ',
      });
    } catch (err) {
      if (err instanceof ValidationError && err.code === 'INVALID_RECIPIENT') {
        recipientRejected = true;
      }
    }
    assert(recipientRejected, 'Whitespace recipient should have been rejected');
    console.log('✓ Invalid recipient rejected correctly');

    console.log('\n=========================================');
    console.log('All Database & Service checks passed! (8/8)');
    console.log('=========================================');
  } finally {
    // Safely close connection before removing files on Windows
    closeDatabase(db);
    cleanupTestDb();
    console.log(`Cleaned up test database files at: ${TEST_DB_PATH}`);
  }
}

runDatabaseVerification().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
