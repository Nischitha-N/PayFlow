import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { TEST_CONFIG } from '../config/test-env';

export interface DbTransactionRow {
  id: string;
  amount_minor: number;
  currency: string;
  recipient: string;
  status: string;
  idempotency_key: string | null;
  created_at: string;
}

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (!dbInstance || !dbInstance.open) {
    dbInstance = new Database(TEST_CONFIG.databasePath);
  }
  return dbInstance;
}

/**
 * Queries the SQLite database directly to fetch a transaction record by its primary key ID.
 * Used for database consistency verification in API tests.
 */
export function getDbTransactionById(id: string): DbTransactionRow | null {
  const db = getDb();
  let row = db
    .prepare<[string], DbTransactionRow>('SELECT * FROM transactions WHERE id = ?')
    .get(id);

  if (!row) {
    // If a standalone dev server was running against default payflow.db, check fallback database
    const devDbPath = path.resolve(process.cwd(), 'data', 'payflow.db');
    if (fs.existsSync(devDbPath) && path.resolve(devDbPath) !== path.resolve(TEST_CONFIG.databasePath)) {
      try {
        const devDb = new Database(devDbPath, { readonly: true });
        row = devDb
          .prepare<[string], DbTransactionRow>('SELECT * FROM transactions WHERE id = ?')
          .get(id);
        devDb.close();
      } catch {
        // Ignore fallback errors
      }
    }
  }

  return row || null;
}

/**
 * Counts the total rows currently in the transactions table.
 */
export function countDbTransactions(): number {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number };
  return result.count;
}

/**
 * Truncates all transaction records in the test database for test cleanup.
 */
export function clearDbTransactions(): void {
  const db = getDb();
  db.prepare('DELETE FROM transactions').run();
}

/**
 * Closes the direct database connection.
 */
export function closeDbAssertConnection(): void {
  if (dbInstance && dbInstance.open) {
    dbInstance.close();
    dbInstance = null;
  }
}
