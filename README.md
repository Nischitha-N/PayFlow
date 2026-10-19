# PayFlow — Payment QA Automation Framework

PayFlow is a simulated payment processing application paired with a dual-runner automated testing framework. It was created to demonstrate modern QA engineering practices across REST APIs, browser UI, embedded database persistence, and BDD acceptance testing.


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



