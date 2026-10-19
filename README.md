# PayFlow — Payment QA Automation Framework

PayFlow is a simulated payment processing application paired with a dual-runner automated testing framework. It was created to demonstrate modern QA engineering practices across REST APIs, browser UI, embedded database persistence, and BDD acceptance testing.

> **Project Nature**: This is a local simulated application built specifically for learning, test automation, and interview demonstration. It does not process real money, connect to live payment gateways, or use external cloud credentials.
>
> 📖 **Interview Preparation Guide**: For a complete, in-depth breakdown of concepts, architecture, and interview Q&As, read the [Interview Preparation Guide](INTERVIEW_PREPARATION_GUIDE.md).

---

## 1. Technology Stack

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Language** | TypeScript | `~5.7` | Static typing, maintainability, and shared contracts |
| **Backend API** | Express | `~4.21` | Simulated payment REST service & static UI hosting |
| **Persistence** | SQLite (`better-sqlite3`) | `~11.8` | Embedded, transactional, zero-config relational database |
| **Technical Automation**| Playwright Test | `~1.50` | Fast API test execution and browser UI automation |
| **BDD Acceptance** | Cucumber.js | `~11.2` | Business-readable Gherkin specifications & living docs |
| **Execution Tooling** | `tsx` / `cross-env` | Current | Cross-platform (Windows/Linux/macOS) TypeScript runner |
| **CI / CD** | GitHub Actions | `v4` | Automated test pipeline on push and pull requests |

---

## 2. High-Level Architecture

The project maintains strict separation between **application code** (`src/app`) and **automation framework code** (`src/test`).

```text
                               +-------------------------------------+
                               |         GitHub Actions CI           |
                               +------------------+------------------+
                                                  |
                         +------------------------+------------------------+
                         |                                                 |
                         v                                                 v
           +---------------------------+                     +---------------------------+
           |   Playwright Test Suite   |                     |    Cucumber BDD Suite     |
           |  - 12 API regression specs|                     |  - 2 Feature files        |
           |  - 9 UI browser specs     |                     |  - 7 Business scenarios   |
           |  - HTML trace reporter    |                     |  - HTML living report     |
           +-------------+-------------+                     +-------------+-------------+
                         |                                                 |
                         +------------------------+------------------------+
                                                  |
                             Reuses Page Objects & DB Assertions
                                                  |
                       +--------------------------+--------------------------+
                       |                          |                          |
               [Browser / UI]             [HTTP REST API]           [Direct SQLite Query]
                       |                          |                          |
                       v                          v                          v
           +---------------------------------------------+       +-----------------------+
           |       Express Web & API Server              |       |    SQLite Database    |
           |  - GET / (Static Web UI)                    | ----> |  - `payflow.test.db`  |
           |  - POST /api/payments (Idempotent payments) |       |  - `transactions`     |
           |  - GET /api/payments (History listing)      |       |  - Foreign keys & WAL |
           |  - GET /api/payments/:id (Lookup)           |       +-----------------------+
           |  - GET /health (Public probe)               |
           +---------------------------------------------+
```

---

## 3. Core QA Concepts & Implementation Details

### 3.1 Monetary Minor-Unit Contract
To eliminate IEEE-754 floating-point rounding bugs:
- Amounts are represented and persisted strictly as positive integers in **minor currency units** (`amountMinor`).
- Example: `$10.50` or `€10.50` is transmitted and stored as `1050`.
- Supported currencies (2 decimal places): `USD`, `EUR`, `INR`.
- The Web UI accepts decimal inputs (e.g., `10.50`) and safely parses them into integer minor units using string splitting and base-10 arithmetic without floating-point calculations.

### 3.2 Idempotency Contract
Payment endpoints accept an optional `x-idempotency-key` header (or request body field):
- **Identical Replay (`200 OK`)**: If an idempotency key was previously processed with identical parameters (`amountMinor`, `currency`, `recipient`), the server returns the existing transaction record without charging again.
- **Conflicting Replay (`409 Conflict`)**: If an existing idempotency key is reused with different parameters, the server rejects the request with HTTP 409 and error code `IDEMPOTENCY_CONFLICT`.

### 3.3 Page Object Model (POM)
- Encapsulated in `src/test/pages/payment.page.ts`.
- Centralizes UI selectors (`#apiKeyInput`, `#paymentForm`, `#recipientInput`, `#amountInput`, `#transactionsTable`, `.alert`) and user actions.
- **Rule**: Assertions remain in test specifications; the Page Object only performs interactions and exposes element states.

### 3.4 Direct SQLite Database Validation
- `src/test/db/db-assert.ts` provides direct database inspection helpers.
- In both Playwright API tests and Cucumber step definitions, tests assert that an HTTP `201 Created` response truly matches the row persisted in SQLite (`amount_minor`, `currency`, `recipient`, `status = 'COMPLETED'`).

### 3.5 Test Data Isolation
- Tests generate unique recipient names and unique idempotency keys per execution (`generateUniqueRecipient()`, `generateUniqueIdempotencyKey()`).
- Tests do not rely on hardcoded IDs or execution order, allowing them to run independently.
- The test suite executes against an isolated database (`./data/payflow.test.db`) rather than development or production data.

---

## 4. Setup & Installation

### Prerequisites
- Node.js (v20.x or v22.x LTS recommended)
- npm (v10.x or higher)

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/PayFlow.git
cd PayFlow

# Install dependencies
npm ci

# Download Chromium for Playwright
npx playwright install chromium
```

---

## 5. Execution Commands

### 5.1 Run Application
```bash
# Start local Express server & UI on http://localhost:3000
npm start
```

### 5.2 Verification Scripts (Standalone Diagnostics)
```bash
# 1. Compile TypeScript
npm run build

# 2. Verify SQLite schema, migrations, constraints & idempotency
npm run verify:db

# 3. Verify Express REST API using real HTTP server & native fetch
npm run verify:api

# 4. Verify Web UI static assets, decimal parser & client lifecycle
npm run verify:ui
```

### 5.3 Automated Test Suites
```bash
# Run all 21 Playwright tests (12 API + 9 UI)
npm run test:playwright

# Run Playwright API tests only
npm run test:playwright:api

# Run Playwright UI tests only
npm run test:playwright:ui

# Run Playwright UI in headed visual browser
npm run test:playwright:headed

# Run all 7 Cucumber BDD acceptance scenarios
npm run test:cucumber

# Run full combined automated test pipeline (Playwright + Cucumber)
npm test
```

### 5.4 Viewing Test Reports
```bash
# Open interactive Playwright HTML report
npx playwright show-report

# Open Cucumber HTML living documentation report (in browser)
# Windows:
start cucumber-report.html
# macOS:
open cucumber-report.html
# Linux:
xdg-open cucumber-report.html
```

---

## 6. Example Test Scenarios

### Playwright API Test Example
```typescript
test('Idempotency conflict returns 409 IDEMPOTENCY_CONFLICT when payload differs', async ({ request }) => {
  const idempotencyKey = generateUniqueIdempotencyKey('conflict');
  const payload = createValidPaymentPayload({ amountMinor: 2000, idempotencyKey });

  // Baseline creation
  const first = await request.post('/api/payments', { headers, data: payload });
  expect(first.status()).toBe(201);

  // Conflicting submission with different amount
  const conflict = await request.post('/api/payments', {
    headers,
    data: { ...payload, amountMinor: 5000 },
  });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
});
```

### Cucumber Gherkin Scenario Example
```gherkin
Scenario: Replaying a payment with identical payload returns the existing transaction
  Given a payment transaction exists for "Nexus Corp" with 3200 "EUR" and an idempotency key
  When I submit an identical payment request using the same idempotency key
  Then the response should return status 200
  And the returned transaction ID should match the original transaction
```

---

## 7. GitHub Actions CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on every `push` and `pull_request`:
1. Checks out repository on `ubuntu-latest`.
2. Sets up Node.js 22 with npm dependency caching.
3. Installs dependencies (`npm ci`) and Playwright Chromium.
4. Compiles TypeScript (`npm run build`).
5. Executes standalone diagnostics (`verify:db`, `verify:api`, `verify:ui`).
6. Executes Playwright test suite (`npm run test:playwright`).
7. Executes Cucumber BDD suite (`npm run test:cucumber`).
8. Uploads Playwright HTML report and Cucumber HTML report as workflow artifacts with 14-day retention.

---

## 8. Interview Talking Points

- **Why Playwright?**  
  Playwright provides a unified, cross-browser engine with built-in request interception, API testing capabilities (`APIRequestContext`), auto-waiting (eliminating flaky explicit sleeps), and rich failure diagnostics (HTML reports, traces, and screenshots).
- **Why both API and UI testing?**  
  API tests provide rapid, granular coverage of boundary values, authentication, error status codes (`400`, `401`, `404`, `409`, `422`), and performance. UI tests validate the complete end-to-end user experience, including DOM updates, input masking, client-side validation feedback, and accessibility.
- **Why the Page Object Model (POM)?**  
  POM encapsulates DOM selectors and interaction mechanics in a single class (`PaymentPage`). When UI elements or CSS classes change, only the Page Object requires updates rather than modifying assertions across dozens of test specs.
- **Why Cucumber.js for BDD?**  
  Cucumber bridges the communication gap between technical engineers and business stakeholders by expressing critical payment rules (monetary constraints, idempotency, duplicate protection) in human-readable Gherkin syntax that acts as living documentation.
- **Why Database Validation?**  
  Verifying HTTP responses alone can miss persistence bugs where an API returns `201 Created` with an in-memory object but truncates columns or fails to commit to SQLite. Querying the database verifies the entire data lifecycle.
- **How does test data isolation work?**  
  Tests generate dynamic recipients and idempotency keys with monotonic timestamps and random hashes. Tests run against a dedicated SQLite database (`./data/payflow.test.db`) and do not depend on execution order or prior state.
- **How does CI execute the tests?**  
  GitHub Actions runs on `ubuntu-latest`, provisions Node 22, builds TypeScript, runs standalone verifications, and executes Playwright and Cucumber sequentially, publishing HTML reports as downloadable build artifacts.
- **How is idempotency tested?**  
  We verify two distinct paths: (1) Replaying the same key with identical data returns `200 OK` with the original transaction record; (2) Reusing the key with altered data returns `409 Conflict` with error code `IDEMPOTENCY_CONFLICT`.

---

## 9. Known Limitations

- **Simulated Scope**: PayFlow is designed for local automated QA testing and does not connect to external credit card networks, clearinghouses, or 3D Secure challenges.
- **Single Currency Minor Unit Model**: The database currently supports two-decimal currencies (`USD`, `EUR`, `INR`). Zero-decimal currencies (like `JPY`) or three-decimal currencies (like `KWD`) would require currency-specific minor unit lookup tables.
- **Sequential SQLite Access**: SQLite file locking requires test workers to run with `workers: 1` during file-based testing to prevent write lock contention.
