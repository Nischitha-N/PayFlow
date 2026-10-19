import { BeforeAll, AfterAll, Before, After } from '@cucumber/cucumber';
import { Server } from 'http';
import { createApp } from '../../../app/app';
import { getDatabase, closeDatabase } from '../../../app/db/connection';
import { PaymentService } from '../../../app/services/payment.service';
import { TEST_CONFIG } from '../../config/test-env';
import { CustomWorld } from './world';

let localServerInstance: Server | null = null;

BeforeAll(async function () {
  process.env.DATABASE_PATH = TEST_CONFIG.databasePath;
  process.env.API_KEY = TEST_CONFIG.apiKey;

  // Check if server is already running (e.g. under an existing process)
  let isRunning = false;
  try {
    const res = await fetch(`${TEST_CONFIG.baseURL}/health`);
    if (res.ok) {
      isRunning = true;
    }
  } catch {
    isRunning = false;
  }

  // If server is not already active, start Express application for Cucumber tests
  if (!isRunning) {
    const db = getDatabase(TEST_CONFIG.databasePath);
    const service = new PaymentService(db);
    const app = createApp({ paymentService: service });

    await new Promise<void>((resolve) => {
      localServerInstance = app.listen(TEST_CONFIG.port, () => {
        resolve();
      });
    });
  }
});

AfterAll(async function () {
  if (localServerInstance) {
    await new Promise<void>((resolve) => {
      localServerInstance?.close(() => {
        closeDatabase();
        localServerInstance = null;
        resolve();
      });
    });
  } else {
    closeDatabase();
  }
});

Before(function (this: CustomWorld) {
  this.lastResponse = null;
  this.originalPayment = null;
});

After(async function (this: CustomWorld) {
  await this.closeBrowser();
});
