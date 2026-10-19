# PayFlow — Comprehensive Project & Interview Preparation Guide

This document is a complete, master preparation guide for interviews. It covers the project concept in simple terms, system architecture, data models, technical trade-offs, test automation strategies, and detailed interview questions with high-scoring answers.

---

## Table of Contents
1. [Project Overview in Simple Words](#1-project-overview-in-simple-words)
2. [Why PayFlow Exists & Real-World Problem Solved](#2-why-payflow-exists--real-world-problem-solved)
3. [System Architecture & Data Flow](#3-system-architecture--data-flow)
4. [Deep-Dive into Core Engineering Concepts](#4-deep-dive-into-core-engineering-concepts)
   - [4.1 Monetary Minor-Unit Precision (Fintech Contract)](#41-monetary-minor-unit-precision-fintech-contract)
   - [4.2 Idempotency & Concurrency Guarantees](#42-idempotency--concurrency-guarantees)
   - [4.3 Authentication & Security Layer](#43-authentication--security-layer)
   - [4.4 Embedded Transactional Database Layer](#44-embedded-transactional-database-layer)
5. [Quality Assurance & Automation Architecture](#5-quality-assurance--automation-architecture)
   - [5.1 The Testing Pyramid in PayFlow](#51-the-testing-pyramid-in-payflow)
   - [5.2 Playwright Test Engineering (API & UI)](#52-playwright-test-engineering-api--ui)
   - [5.3 BDD Acceptance with Cucumber.js](#53-bdd-acceptance-with-cucumberjs)
   - [5.4 Page Object Model (POM) Design Pattern](#54-page-object-model-pom-design-pattern)
   - [5.5 Direct SQLite Truth Verification (Three-Way Validation)](#55-direct-sqlite-truth-verification-three-way-validation)
   - [5.6 Test Data Isolation & Determinism](#56-test-data-isolation--determinism)
6. [CI/CD Pipeline & DevOps Automation](#6-cicd-pipeline--devops-automation)
7. [Elevator Pitches: How to Pitch PayFlow in Interviews](#7-elevator-pitches-how-to-pitch-payflow-in-interviews)
   - [30-Second Recruiter Pitch](#30-second-recruiter-pitch)
   - [2-Minute Technical Pitch](#2-minute-technical-pitch)
   - [5-Minute System Walkthrough](#5-minute-system-walkthrough)
8. [Comprehensive Interview Questions & Model Answers](#8-comprehensive-interview-questions--model-answers)
   - [Category A: General Architecture & Design](#category-a-general-architecture--design)
   - [Category B: Fintech & Idempotency Questions](#category-b-fintech--idempotency-questions)
   - [Category C: QA Automation & Playwright Questions](#category-c-qa-automation--playwright-questions)
   - [Category D: BDD & Cucumber Questions](#category-d-bdd--cucumber-questions)
   - [Category E: Database & Concurrency Questions](#category-e-database--concurrency-questions)
   - [Category F: Debugging, Flakiness & CI/CD Questions](#category-f-debugging-flakiness--cicd-questions)
9. [Trade-offs & Future Production Roadmap](#9-trade-offs--future-production-roadmap)
10. [Key Technical Terminology Cheat Sheet](#10-key-technical-terminology-cheat-sheet)

---

## 1. Project Overview in Simple Words

### What is PayFlow?
**PayFlow** is a simulated payment gateway and transactional ledger application paired with an enterprise-grade automated testing framework. It consists of:
1. **A Payment Engine (Application Layer)**: A RESTful API and responsive web dashboard that enables users to transfer money between parties in multiple currencies (`USD`, `EUR`, `GBP`), safely preventing duplicate charges.
2. **A Dual-Runner Automation Framework (QA Layer)**: A test suite using **Playwright** (for fast REST API regression and end-to-end browser testing) and **Cucumber.js** (for Behavior-Driven Development living documentation), integrated into **GitHub Actions CI/CD**.

### Analogy (Explain Like I'm 5)
Imagine buying a coffee with a card reader:
- If the internet glitches right as you tap your card and the cashier hits "Charge" again, you do not want to be billed twice. That is **Idempotency**.
- When the coffee shop tallies pennies, they cannot lose fractions of a cent due to rounding errors. That is **Minor-Unit Accounting**.
- When an engineer checks the system, they don't just ask the screen if the payment went through—they check the bank's actual lockbox to make sure the money landed. That is **Direct Database Verification**.
- **PayFlow** is the platform that implements these rules and automates thousands of checks to ensure the payment machine never fails.

---

## 2. Why PayFlow Exists & Real-World Problem Solved

Payment systems are mission-critical. Unlike a social media app where a lost comment is a minor inconvenience, **a failure in a payment pipeline means lost money, compliance fines, and immediate reputational ruin**.

PayFlow was engineered to tackle the top challenges in payment engineering and QA automation:

| Real-World Challenge | How PayFlow Solves It |
| :--- | :--- |
| **Floating-Point Rounding (`0.1 + 0.2 = 0.30000000000000004`)** | Enforces integer arithmetic in minor currency units (cents, pence). Eliminates IEEE-754 precision bugs. |
| **Network Retries & Double Billing** | Supports unique `x-idempotency-key` tracking with database-backed constraints and payload verification. |
| **Flaky Automated Tests** | Adopts Playwright's auto-wait mechanisms, strict test data isolation, and single-worker SQLite locking. |
| **Communication Gap Between Business & Dev** | Uses Gherkin BDD syntax (`Given-When-Then`) so non-technical stakeholders can read, approve, and verify test scenarios. |
| **Superficial "Green" Tests** | Uses "Three-Way Validation": UI check + REST API response check + direct SQLite query to verify on-disk state. |

---

## 3. System Architecture & Data Flow

### Architecture Diagram

```
                              +---------------------------------------+
                              |          GitHub Actions CI/CD         |
                              |   (Build, Diagnostics, Test, Reports) |
                              +-------------------+-------------------+
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
                                                  v
                               +-------------------------------------+
                               |         Shared Test Fixtures        |
                               |  - PaymentPage (Page Object Model)  |
                               |  - DbAssert (Direct SQLite queries) |
                               |  - Test Data Generators (UUIDs)     |
                               +------------------+------------------+
                                                  |
                     +----------------------------+----------------------------+
                     |                            |                            |
                     v (Browser Actions)          v (HTTP Requests)            v (Direct DB Queries)
         +-----------------------+    +-----------------------+    +-----------------------+
         |   Single-Page Web UI  |    |  Express REST Service |    |   SQLite Persistence  |
         |  - Vanilla HTML5/CSS3 |    |  - Auth Middleware    |    |  - `payflow.test.db`  |
         |  - Client validator   |--->|  - Error Handler      |--->|  - Table: transactions|
         |  - Decimal-to-minor   |    |  - Payment Service    |    |  - WAL mode enabled   |
         +-----------------------+    +-----------------------+    +-----------------------+
```

### Layer-by-Layer Breakdown

1. **Presentation Layer (Web UI)**:
   - Built with Vanilla HTML5, CSS3, and JavaScript without bloated frameworks.
   - Converts human decimal input (e.g., `10.50`) into minor currency units (`1050`) using string parsing, avoiding floating-point math.
   - Provides live API key management, payment submission, responsive status alerts, and history refresh.

2. **Middleware & Routing Layer (Express REST API)**:
   - `authenticateApiKey`: Protects endpoints via `x-api-key`. Returns `401 Unauthorized` if missing/invalid, or `500` if misconfigured.
   - `createPaymentRouter`: Exposes `POST /api/payments`, `GET /api/payments`, and `GET /api/payments/:id`.
   - `errorHandler`: Centralized error-handling middleware that maps custom error instances (`ValidationError`, `IdempotencyConflictError`, `NotFoundError`) into clean RFC-compliant JSON responses.

3. **Domain Service Layer (`PaymentService`)**:
   - Contains core business rules, input sanitization, payload validation, and idempotency checks.
   - Completely decoupled from HTTP specifics, allowing direct unit testing without running a network server.

4. **Persistence Layer (`SQLite` via `better-sqlite3`)**:
   - Embedded, high-performance synchronous relational database running in Write-Ahead Logging (`WAL`) mode.
   - Strict database constraints (`CHECK` conditions on amount, currencies, and recipient) guarantee data integrity even if the application layer has a bug.

---

## 4. Deep-Dive into Core Engineering Concepts

### 4.1 Monetary Minor-Unit Precision (Fintech Contract)
- **The Problem**: Standard computer numbers use the IEEE-754 floating-point standard. If you perform `0.1 + 0.2` in JavaScript or Python, the result is `0.30000000000000004`. In banking, accumulating rounding errors causes reconciliation failures and audit violations.
- **The PayFlow Solution**: All monetary amounts are handled, transmitted, and persisted strictly as **integers in minor currency units**:
  - `$10.50` USD = `1050`
  - `£5.00` GBP = `500`
  - `€0.99` EUR = `99`
- **Frontend Decimal Parsing Algorithm**: The client splits the input string on the decimal point (`.`), pads the fractional part to exactly 2 digits, and parses it via integer math:
  ```javascript
  const [whole, frac = ''] = rawStr.split('.');
  const paddedFrac = (frac + '00').slice(0, 2);
  const minorUnits = parseInt(whole, 10) * 100 + parseInt(paddedFrac, 10);
  ```

### 4.2 Idempotency & Concurrency Guarantees
- **What is Idempotency?**: An operation is idempotent if executing it multiple times produces the exact same outcome as executing it once.
- **How PayFlow Handles Idempotency**:
  1. Client sends an `x-idempotency-key` header (e.g., UUID `9b1deb4d-...`).
  2. The server queries the `transactions` table for this key:
     - **Case A (Identical Replay)**: The key exists, and `amountMinor`, `currency`, and `recipient` match the previous record. The server returns HTTP `200 OK` with the existing transaction data. **No new transaction is created**.
     - **Case B (Conflict Replay)**: The key exists, but the user changed the amount, currency, or recipient. The server rejects the call with **HTTP `409 Conflict`** and error code `IDEMPOTENCY_CONFLICT`.
     - **Case C (First Execution)**: The key does not exist. The server inserts a new record and returns **HTTP `201 Created`**.
  3. **Race Condition Protection**: If two identical requests hit the server concurrently, SQLite's `UNIQUE` constraint on `idempotency_key` rejects the second insert, catching the race condition and safely falling back to returning the original record.

### 4.3 Authentication & Security Layer
- Protected endpoints require an `x-api-key` header.
- **Fail-Safe Design**: If the server starts without an `API_KEY` defined in the environment, the middleware does not default to open access; it rejects all requests with `500 AUTH_CONFIGURATION_ERROR`.
- Input validation sanitizes all string fields (`trim()`) and enforces strict types.

### 4.4 Embedded Transactional Database Layer
- Table Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR', 'GBP')),
    recipient TEXT NOT NULL CHECK (length(trim(recipient)) > 0),
    status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
    idempotency_key TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
  ```
- **SQLite Pragmas for Speed & Reliability**:
  - `journal_mode = WAL` (Write-Ahead Logging allows concurrent reads without blocking writes).
  - `busy_timeout = 5000` (prevents instant failures under short lock contentions).
  - `foreign_keys = ON`.

---

## 5. Quality Assurance & Automation Architecture

### 5.1 The Testing Pyramid in PayFlow

```
                   / \
                  /   \
                 / BDD \         7 Scenarios (Cucumber.js living documentation)
                /-------\
               /   UI    \       9 Browser Specs (Playwright Chromium)
              /-----------\
             /     API     \     12 REST API Specs (Boundary, Security, Errors)
            /---------------\
           /   Diagnostics   \   Standalone verify:db, verify:api, verify:ui
          +-------------------+
```

### 5.2 Playwright Test Engineering (API & UI)
- **API Testing via `APIRequestContext`**:
  - Executes directly via HTTP without spinning up a browser.
  - Sub-millisecond execution speeds.
  - Covers status codes: `201 Created`, `200 OK`, `400 Bad Request`, `401 Unauthorized`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`.
- **UI Testing with Smart Waiting**:
  - Zero arbitrary sleeps (`page.waitForTimeout` is forbidden).
  - Uses Playwright’s locator auto-waiting (`toBeVisible()`, `toHaveText()`).
  - Automatically captures screenshots and trace zip files on test failure for instant debugging.
- **Automatic Server Lifecycle (`webServer`)**:
  - Playwright automatically boots the Express application on port 3000, polls `/health` until ready, runs the test suite, and tears the server down cleanly.

### 5.3 BDD Acceptance with Cucumber.js
- Formats critical business requirements in human-readable Gherkin syntax.
- **Living Documentation**: Generates an HTML report (`cucumber-report.html`) that can be shared with non-technical product managers.
- Example Feature:
  ```gherkin
  Scenario: Replaying a payment with identical payload returns the existing transaction
    Given a payment transaction exists for "Nexus Corp" with 3200 "EUR" and an idempotency key
    When I submit an identical payment request using the same idempotency key
    Then the response should return status 200
    And the returned transaction ID should match the original transaction
  ```

### 5.4 Page Object Model (POM) Design Pattern
- Encapsulated in `PaymentPage` (`src/test/pages/payment.page.ts`).
- **Core Principle**: Selectors and user actions belong inside the Page Object; assertions belong in the test file.
  ```typescript
  // The Page Object handles DOM interaction:
  await paymentPage.submitPayment({ recipient: 'Acme Corp', amount: '25.00', currency: 'USD' });

  // The Test Spec handles assertions:
  await expect(paymentPage.successAlert).toBeVisible();
  ```
- **Benefit**: If a CSS class or button ID changes in the UI, only `PaymentPage` needs to be edited, preserving dozens of test specs.

### 5.5 Direct SQLite Truth Verification (Three-Way Validation)
A critical innovation in PayFlow is **Three-Way Validation**:
1. **Client Tier**: Web UI displays a success banner and shows the transaction in the history table.
2. **API Tier**: HTTP response returns `201 Created` with a matching JSON body.
3. **Database Tier (`db-assert.ts`)**: The test suite opens a direct connection to `payflow.test.db` and executes `SELECT * FROM transactions WHERE id = ?`. It asserts that the integer `amount_minor` and `status = 'COMPLETED'` were committed to disk.

> **Why this matters for interviewers**: Many automated test suites only test the API response. If an API returns `201` with an in-memory object but fails to commit to the database due to a transaction rollback or truncated column, standard tests will pass, but production will suffer data loss. PayFlow prevents this.

### 5.6 Test Data Isolation & Determinism
- **Dynamic Data Generation**: Every test dynamically creates unique recipient names (`generateUniqueRecipient()`) and random UUIDs for idempotency keys.
- **Isolated Database**: Automated tests run against `./data/payflow.test.db`, never touching production or development databases.
- **Single-Worker Execution**: Playwright runs with `workers: 1` during SQLite tests to prevent file lock contention issues.

---

## 6. CI/CD Pipeline & DevOps Automation

The GitHub Actions pipeline (`.github/workflows/ci.yml`) executes on every `push` and `pull_request`:

1. **Environment Setup**: Spawns an `ubuntu-latest` runner with Node.js 22.
2. **Deterministic Installation**: Runs `npm ci` for lockfile integrity.
3. **Browser Binary Provisioning**: Runs `npx playwright install --with-deps chromium`.
4. **Static Typecheck**: Compiles TypeScript (`npm run build`).
5. **Tier 1 - Fast Diagnostics**: Runs `verify:db`, `verify:api`, and `verify:ui`.
6. **Tier 2 - Technical Regression**: Runs all 21 Playwright tests (`npm run test:playwright`).
7. **Tier 3 - Business Acceptance**: Runs all 7 Cucumber BDD scenarios (`npm run test:cucumber`).
8. **Artifact Archiving**: Exports both Playwright Trace reports and Cucumber HTML living documentation with a 14-day retention policy.

---

## 7. Elevator Pitches: How to Pitch PayFlow in Interviews

### 30-Second Recruiter Pitch
> *"PayFlow is a simulated payment processing application and automated QA framework that I built in TypeScript. It demonstrates production-level fintech patterns like integer minor-unit money calculations and distributed idempotency to prevent double-charging. On the QA side, it features a dual-runner test architecture using Playwright for fast API and browser testing, and Cucumber BDD for living documentation, fully automated via GitHub Actions CI."*

### 2-Minute Technical Pitch
> *"In financial systems, small bugs cause catastrophic losses—especially floating-point rounding errors and network retry duplicate charges. I built PayFlow to model how enterprise fintech systems solve these problems.
>
> On the backend, PayFlow uses Node.js, Express, and an embedded SQLite database running in WAL mode. I designed it with a strict monetary minor-unit contract where all amounts are positive integers, and an idempotency engine backed by unique constraints that returns HTTP 200 for safe replays and HTTP 409 for parameter conflicts.
>
> For quality engineering, I implemented a dual-runner framework. I used Playwright to execute sub-millisecond API regression tests and browser UI tests using the Page Object Model and auto-waiting locators. I paired this with Cucumber.js so business stakeholders can read living Gherkin specifications. Crucially, I implemented a Three-Way Verification strategy where tests don't just assert HTTP status codes, but query the SQLite database directly to guarantee transactional persistence. Everything runs in GitHub Actions CI with automated HTML reporting."*

### 5-Minute System Walkthrough
*(Structure your conversation using this 4-step framework)*:
1. **The Problem Space**: Explain IEEE-754 floating-point pitfalls and why idempotency is non-negotiable in payment gateways.
2. **The Architecture**: Walk through the Express API, the `PaymentService` domain logic, and SQLite database schema.
3. **The Automation Strategy**: Discuss Playwright (`APIRequestContext` + UI locators) vs. Cucumber Gherkin scenarios. Explain Page Object Model and test data isolation.
4. **Verification & CI/CD**: Highlight the Three-Way Verification (UI + API + DB) and how GitHub Actions enforces automated quality gates before any code merges.

---

## 8. Comprehensive Interview Questions & Model Answers

### Category A: General Architecture & Design

#### Q1: Can you explain the high-level architecture of PayFlow?
**Answer**:  
PayFlow is architected with a strict separation of concerns into four distinct layers:
1. **Presentation**: A responsive single-page web UI that parses human decimal input into minor currency units.
2. **API & Routing**: An Express REST layer with authentication middleware, request validation, and centralized error handling.
3. **Domain Service**: A pure TypeScript service layer (`PaymentService`) containing payment business logic, idempotency matching, and conflict detection.
4. **Persistence**: An embedded SQLite database with strict `CHECK` constraints and `WAL` journal mode.
Coupled with this is an isolated automation framework running Playwright and Cucumber against a dedicated test database.

#### Q2: Why did you separate application code from test framework code?
**Answer**:  
In `src/`, `app/` contains strictly production application logic, while `test/` contains test specs, fixtures, page objects, and diagnostics. This guarantees that test helpers, mock generators, and testing libraries like `@playwright/test` are never bundled into production builds, keeping the production footprint minimal, secure, and clean.

#### Q3: Why did you choose SQLite over PostgreSQL or MySQL for this project?
**Answer**:  
For a standalone demonstration and testing framework, SQLite (`better-sqlite3`) provides a zero-config, embedded, and transactional relational database that runs consistently across Windows, macOS, and Linux CI runners without needing external Docker containers or cloud credentials. It supports full ACID transactions, strict schema constraints, and WAL mode, making it ideal for deterministic test automation.

---

### Category B: Fintech & Idempotency Questions

#### Q4: Why is floating-point arithmetic dangerous in payment systems, and how did you prevent it?
**Answer**:  
Standard programming languages represent decimals using IEEE-754 floating-point binary representation. Because numbers like `0.1` cannot be precisely represented in base-2, calculations like `0.1 + 0.2` yield `0.30000000000000004`. Over thousands of transactions, fractional rounding differences lead to financial reconciliation discrepancies and regulatory non-compliance.  
In PayFlow, I enforced a **minor-unit monetary contract**: all amounts are integers representing the smallest currency unit (e.g., cents or pence: `$10.50` is `1050`). On the frontend, instead of doing `parseFloat(val) * 100` (which itself can introduce floating-point inaccuracies), I parse the string directly by splitting on the decimal point and padding the fractional part.

#### Q5: What is idempotency, and how is it implemented in PayFlow?
**Answer**:  
Idempotency ensures that an API request can be repeated multiple times without changing the state beyond the initial call. In payment processing, if a network timeout occurs after a customer clicks "Pay", the client or browser may automatically retry the request. Without idempotency, the customer is double-charged.  
In PayFlow:
1. The client sends an `x-idempotency-key`.
2. When received, the system checks the database:
   - If the key exists and the payload (`amountMinor`, `currency`, `recipient`) is **identical**, it returns `200 OK` with the existing transaction without recharging.
   - If the key exists but any payload parameter **differs**, it rejects the call with `409 Conflict` (`IDEMPOTENCY_CONFLICT`).
   - If the key is new, it inserts the record and returns `201 Created`.
3. To protect against concurrent race conditions, the database enforces a `UNIQUE` constraint on `idempotency_key`. If two identical requests hit the server at the exact same millisecond, the database catches the duplicate insert and safely returns the existing record.

---

### Category C: QA Automation & Playwright Questions

#### Q6: Why did you choose Playwright over Cypress or Selenium?
**Answer**:  
I chose Playwright for four primary reasons:
1. **Unified API + UI Testing**: With Playwright's `APIRequestContext`, I can run lightning-fast backend API tests and browser UI tests in the exact same framework.
2. **Auto-Waiting**: Playwright automatically waits for elements to be actionable, visible, and stable before interacting with them, eliminating arbitrary sleeps (`sleep()` / `waitForTimeout`) that cause test flakiness.
3. **Powerful Diagnostics**: Playwright captures full execution traces, DOM snapshots, network calls, and videos on test failure.
4. **Built-in WebServer Management**: Playwright's config can automatically boot the Express server, wait for the `/health` endpoint to be ready, run the tests, and tear down the server.

#### Q7: What is the Page Object Model (POM), and what rules did you follow when implementing it?
**Answer**:  
The Page Object Model is a design pattern that abstracts the web page's structure and user interactions into a reusable class (`PaymentPage`).  
My key rule was: **Page Objects contain selectors and actions; test specifications contain assertions**.  
For example, `paymentPage.submitPayment(...)` fills inputs and clicks submit. The test file then asserts `expect(paymentPage.successAlert).toBeVisible()`. This separation ensures that if an HTML ID or CSS class changes, I only update the selector in one place without breaking test assertions.

#### Q8: How did you test error status codes with Playwright?
**Answer**:  
Using Playwright's `request` fixture, I tested both positive and negative boundary paths:
- Missing API key returns `401 Unauthorized`.
- Non-integer or negative amounts return `422 Unprocessable Entity` with specific error codes like `INVALID_AMOUNT_FORMAT` or `INVALID_AMOUNT_VALUE`.
- Unsupported currency (e.g., `JPY` or `XYZ`) returns `422 UNSUPPORTED_CURRENCY`.
- Empty recipient string returns `422 INVALID_RECIPIENT`.
- Non-existent transaction ID returns `404 TRANSACTION_NOT_FOUND`.
- Invalid JSON body returns `400 BAD_REQUEST`.

---

### Category D: BDD & Cucumber Questions

#### Q9: What is the business value of Behavior-Driven Development (BDD) and Cucumber?
**Answer**:  
BDD bridges the communication gap between business analysts, product owners, developers, and QA engineers. In payment systems, business rules (such as refund policies, currency constraints, and duplicate transaction protection) must be agreed upon before coding begins. By writing specifications in Gherkin (`Given`, `When`, `Then`), the requirements serve as **executable specifications and living documentation**. If the code changes and violates the business rule, the scenario fails immediately in CI.

#### Q10: How do you share state between steps in Cucumber without creating global variable pollution?
**Answer**:  
In Cucumber.js, state should never be stored in global variables because test scenarios can leak state into one another. Instead, we use Cucumber's **World Context** (`this`). In each scenario, Cucumber instantiates an isolated World object where we store the response of the previous step (e.g., `this.lastResponse`, `this.lastPayload`). When the scenario finishes, the World instance is garbage collected.

---

### Category E: Database & Concurrency Questions

#### Q11: What is "Three-Way Validation", and why is it important in test automation?
**Answer**:  
Three-Way Validation is verifying application correctness across the three major tiers:
1. **UI Tier**: Checking that the user interface responded with the correct visual confirmation and populated the table.
2. **API Tier**: Checking that the HTTP response status code is `201 Created` and the JSON response contains the expected schema and transaction ID.
3. **Database Tier**: Connecting directly to SQLite and running a query to confirm that the row was actually written to the disk with the exact values.  
This is critical because API responses can be mocked or return an in-memory object even if the database transaction failed to commit. Querying the database verifies the complete data persistence lifecycle.

#### Q12: How do you handle concurrency and file locks with SQLite during automated testing?
**Answer**:  
SQLite is a serverless, file-based database. While WAL mode allows multiple readers alongside a writer, high-frequency concurrent writes from multiple parallel test threads can cause `SQLITE_BUSY` (database locked) errors.  
To ensure 100% deterministic test execution, I configured:
1. `fullyParallel: false` and `workers: 1` in `playwright.config.ts`.
2. A database busy timeout pragma (`PRAGMA busy_timeout = 5000`), giving SQLite up to 5 seconds to acquire a lock before failing.
3. Unique test data per test case so tests do not collide on primary keys.

---

### Category F: Debugging, Flakiness & CI/CD Questions

#### Q13: How do you debug a test that passes locally on Windows but fails in GitHub Actions on Linux?
**Answer**:  
1. **Check Case Sensitivity**: Linux filesystems are case-sensitive (`Payment.ts` vs `payment.ts`), whereas Windows is case-insensitive.
2. **Inspect Downloadable CI Artifacts**: In my GitHub Actions workflow, I configured `upload-artifact` to archive Playwright's trace files and HTML reports on failure. I download the trace and run `npx playwright show-trace trace.zip` to step through DOM snapshots, network requests, and console logs at the exact moment of failure.
3. **Check Environment Variables**: Ensure `PORT`, `API_KEY`, and `DATABASE_PATH` are properly defined in the CI environment step.
4. **Inspect Path Separators**: Ensure file paths use `path.resolve()` or `path.join()` rather than hardcoded backslashes (`\`).

#### Q14: How does PayFlow prevent test pollution and maintain test data isolation?
**Answer**:  
Test pollution occurs when one test modifies data that subsequent tests rely upon. PayFlow prevents this through:
- **Dynamic Data Generators**: Every test call uses helper functions like `generateUniqueRecipient()` and `generateUniqueIdempotencyKey()` which append timestamps and random hexadecimal strings.
- **No Hardcoded IDs**: Tests never expect a transaction ID to be `txn_1` or rely on a specific database row count.
- **Dedicated Test Database**: Execution runs against `payflow.test.db`, completely separated from development data.

---

## 9. Trade-offs & Future Production Roadmap

During an interview, showcasing awareness of system trade-offs and future scaling demonstrates senior-level maturity.

| Current Design (Simulated Scope) | Production Scale Design | Rationale / Trade-off |
| :--- | :--- | :--- |
| **SQLite (`better-sqlite3`)** | PostgreSQL or Amazon Aurora | SQLite is ideal for zero-config embedded testing, but horizontally scaled microservices require a distributed, multi-master or read-replica relational database. |
| **Local In-Memory / DB Idempotency** | Redis Distributed Lock + PostgreSQL | High-throughput distributed payment gateways use Redis (with Redlock or single-instance TTL keys) for sub-millisecond idempotency deduplication before hitting the relational database. |
| **2-Decimal Currencies (`USD`, `EUR`, `GBP`)** | Currency Decimal Lookup Engine | Some currencies have 0 decimals (`JPY`, `KRW`) and others have 3 decimals (`KWD`, `BHD`). Production requires an ISO 4217 currency metadata dictionary to dynamically calculate minor unit exponents ($10^n$). |
| **Synchronous In-Process Payments** | Asynchronous Event-Driven Architecture (Kafka / RabbitMQ) | Real payments take seconds or minutes to settle. Production systems accept the payment request, emit an event, return `202 Accepted`, and update status via webhooks or WebSockets. |
| **Single API Key Auth** | OAuth2 / JWT + Mutual TLS (mTLS) | Enterprise payment APIs require signed bearer tokens, role-based access control (RBAC), and encrypted mTLS transport between banking nodes. |

---

## 10. Key Technical Terminology Cheat Sheet

- **Minor Currency Units**: The smallest fractional division of a currency (e.g., 1 cent = 1/100th of a dollar). Used to enforce integer arithmetic and prevent rounding errors.
- **Idempotency**: The mathematical and architectural property that an operation can be applied multiple times without altering the result beyond the initial application.
- **Three-Way Validation**: A QA verification pattern that validates system correctness simultaneously at the UI presentation tier, the API network tier, and the database persistence tier.
- **Page Object Model (POM)**: A structural design pattern in automated testing that models web pages as software objects, encapsulating selectors and DOM manipulations away from assertions.
- **Living Documentation**: System documentation generated automatically from executable test specifications (e.g., Cucumber HTML reports derived from Gherkin feature files).
- **WAL (Write-Ahead Logging)**: A SQLite journaling mode that writes changes to a separate log file before committing to the main database, enabling simultaneous reads and writes without lock contention.
- **Auto-Waiting**: A Playwright capability that automatically waits for UI elements to satisfy actionability criteria (visible, enabled, stable) before executing clicks or typing.
