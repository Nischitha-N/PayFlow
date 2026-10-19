import fs from 'fs';
import path from 'path';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../../app/app';
import { getDatabase, closeDatabase } from '../../app/db/connection';
import { PaymentService } from '../../app/services/payment.service';

const TEST_DB_PATH = path.resolve(process.cwd(), 'data', 'payflow.verify-ui.test.db');
const TEST_API_KEY = 'verify_ui_key_secret_456';

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

// Client monetary parser under test (mirrors src/app/public/app.js)
function parseDecimalToMinorUnits(valueStr: string): number {
  if (!valueStr || typeof valueStr !== 'string') {
    throw new Error('Please enter a payment amount.');
  }
  const trimmed = valueStr.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Amount must be a positive number with at most 2 decimal places (e.g. 10.50).');
  }
  const parts = trimmed.split('.');
  const whole = parseInt(parts[0], 10);
  const fracStr = parts[1] || '';
  const frac = parseInt(fracStr.padEnd(2, '0'), 10);
  const totalMinor = whole * 100 + frac;

  if (totalMinor <= 0) {
    throw new Error('Amount must be strictly greater than zero.');
  }
  return totalMinor;
}

function formatMinorUnits(minorUnits: number): string {
  if (typeof minorUnits !== 'number' || isNaN(minorUnits)) {
    return '0.00';
  }
  const whole = Math.floor(minorUnits / 100);
  const frac = (minorUnits % 100).toString().padStart(2, '0');
  return `${whole}.${frac}`;
}

async function runUiSmokeVerification(): Promise<void> {
  console.log('--- Starting PayFlow Web UI & Static Hosting Verification ---');
  console.log(`Using isolated test database: ${TEST_DB_PATH}`);

  cleanupTestDb();

  const db = getDatabase(TEST_DB_PATH);
  const paymentService = new PaymentService(db);
  const app = createApp({ paymentService });

  let server: Server;
  let baseUrl = '';

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://localhost:${address.port}`;
      console.log(`Real Express server serving UI on ${baseUrl}`);
      resolve();
    });
  });

  try {
    // 1. Verify GET / loads HTML dashboard
    console.log('\n[Check 1] GET / loads index.html dashboard');
    const htmlRes = await fetch(`${baseUrl}/`);
    assert(htmlRes.status === 200, `Expected 200, got ${htmlRes.status}`);
    const contentType = htmlRes.headers.get('content-type') || '';
    assert(contentType.includes('text/html'), `Expected text/html, got ${contentType}`);
    const htmlBody = await htmlRes.text();
    assert(htmlBody.includes('PayFlow'), 'HTML must include PayFlow title');
    assert(htmlBody.includes('id="paymentForm"'), 'HTML must include #paymentForm');
    assert(htmlBody.includes('id="transactionsTable"'), 'HTML must include #transactionsTable');
    assert(htmlBody.includes('id="apiKeyInput"'), 'HTML must include #apiKeyInput');
    assert(htmlBody.includes('id="submitPaymentBtn"'), 'HTML must include #submitPaymentBtn');
    assert(htmlBody.includes('id="refreshBtn"'), 'HTML must include #refreshBtn');
    console.log('✓ Dashboard HTML rendered successfully with all required controls');

    // 2. Verify GET /style.css loads CSS
    console.log('\n[Check 2] GET /style.css loads stylesheets');
    const cssRes = await fetch(`${baseUrl}/style.css`);
    assert(cssRes.status === 200, `Expected 200, got ${cssRes.status}`);
    const cssContentType = cssRes.headers.get('content-type') || '';
    assert(cssContentType.includes('text/css'), `Expected text/css, got ${cssContentType}`);
    const cssBody = await cssRes.text();
    assert(cssBody.includes('--bg-primary'), 'CSS must include theme variables');
    assert(cssBody.includes('.data-table'), 'CSS must style .data-table');
    console.log('✓ Static stylesheet loaded successfully');

    // 3. Verify GET /app.js loads client JavaScript
    console.log('\n[Check 3] GET /app.js loads client application script');
    const jsRes = await fetch(`${baseUrl}/app.js`);
    assert(jsRes.status === 200, `Expected 200, got ${jsRes.status}`);
    const jsBody = await jsRes.text();
    assert(jsBody.includes('parseDecimalToMinorUnits'), 'app.js must include minor unit parser');
    assert(jsBody.includes('formatMinorUnits'), 'app.js must include minor unit formatter');
    console.log('✓ Static client JavaScript loaded successfully');

    // 4. Verify client-side monetary parser and formatter logic
    console.log('\n[Check 4] Decimal monetary parsing & formatting without floating-point math');
    assert(parseDecimalToMinorUnits('10.50') === 1050, '10.50 should parse to 1050');
    assert(parseDecimalToMinorUnits('5') === 500, '5 should parse to 500');
    assert(parseDecimalToMinorUnits('0.99') === 99, '0.99 should parse to 99');
    assert(parseDecimalToMinorUnits('0.01') === 1, '0.01 should parse to 1');
    assert(parseDecimalToMinorUnits('1234.56') === 123456, '1234.56 should parse to 123456');

    assert(formatMinorUnits(1050) === '10.50', '1050 should format to 10.50');
    assert(formatMinorUnits(500) === '5.00', '500 should format to 5.00');
    assert(formatMinorUnits(99) === '0.99', '99 should format to 0.99');
    assert(formatMinorUnits(1) === '0.01', '1 should format to 0.01');

    // Test rejection of invalid amounts
    const invalidInputs = ['0', '-5', '10.555', 'abc', '10..5', ''];
    for (const bad of invalidInputs) {
      let threw = false;
      try {
        parseDecimalToMinorUnits(bad);
      } catch {
        threw = true;
      }
      assert(threw, `Invalid decimal amount '${bad}' should be rejected`);
    }
    console.log('✓ Monetary integer conversion and formatting strictly validated');

    // 5. Verify UI-to-API lifecycle (Simulate client form submission & table refresh)
    console.log('\n[Check 5] UI integration lifecycle: API key auth, submit payment, and list update');
    
    // Attempt without API key -> rejected
    const unauthList = await fetch(`${baseUrl}/api/payments`);
    assert(unauthList.status === 401, 'Unauthenticated table load must be rejected with 401');

    // Submit payment as browser would
    const uiAmountMinor = parseDecimalToMinorUnits('42.75'); // $42.75
    const submitRes = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: JSON.stringify({
        recipient: 'Starlight Media',
        currency: 'USD',
        amountMinor: uiAmountMinor,
      }),
    });
    assert(submitRes.status === 201, `Payment submission expected 201, got ${submitRes.status}`);
    const submitData = (await submitRes.json()) as { data: { id: string; amountMinor: number } };
    assert(submitData.data.amountMinor === 4275, 'Persisted amountMinor must be 4275');

    // Refresh table as browser would
    const refreshRes = await fetch(`${baseUrl}/api/payments`, {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    assert(refreshRes.status === 200, 'Table refresh must return 200');
    const refreshData = (await refreshRes.json()) as { data: Array<{ id: string; amountMinor: number }> };
    assert(refreshData.data.length === 1, 'Transaction history should have 1 item');
    assert(refreshData.data[0].id === submitData.data.id, 'Transaction ID should match');
    assert(formatMinorUnits(refreshData.data[0].amountMinor) === '42.75', 'Formatted amount should be 42.75');
    console.log('✓ UI integration cycle (form submit -> API -> history refresh) verified');

    console.log('\n=========================================');
    console.log('All Web UI & Static Hosting checks passed! (5/5)');
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

runUiSmokeVerification().catch((err) => {
  console.error('\nUI Verification failed:', err);
  process.exit(1);
});
