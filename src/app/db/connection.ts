import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getConfig } from '../config';
import { CREATE_INDEXES, CREATE_TRANSACTIONS_TABLE } from './schema';

let activeDatabaseInstance: Database.Database | null = null;
let activeDatabasePath: string | null = null;

/**
 * Initializes and returns a SQLite database connection with applied migrations and safety pragmas.
 * If no custom path is provided, it uses the database path configured in the environment.
 */
export function getDatabase(customPath?: string): Database.Database {
  const targetPath = customPath ? path.resolve(customPath) : getConfig().databasePath;

  // Return existing singleton connection if path matches and connection is open
  if (activeDatabaseInstance && activeDatabasePath === targetPath && activeDatabaseInstance.open) {
    return activeDatabaseInstance;
  }

  // Ensure parent directory exists for file-based databases
  if (targetPath !== ':memory:') {
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  const db = new Database(targetPath);

  // Safety settings
  db.pragma('foreign_keys = ON');
  if (targetPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  // Run schema migration
  db.exec(CREATE_TRANSACTIONS_TABLE);
  db.exec(CREATE_INDEXES);

  // Migration: Update CHECK constraint to support INR if existing table still has GBP
  try {
    const tableInfo = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'")
      .get() as { sql?: string } | undefined;

    if (tableInfo?.sql && tableInfo.sql.includes("'GBP'") && !tableInfo.sql.includes("'INR'")) {
      db.pragma('foreign_keys = OFF');
      db.exec('BEGIN TRANSACTION;');
      db.exec(`
        CREATE TABLE transactions_new (
          id TEXT PRIMARY KEY,
          amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
          currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR', 'INR')),
          recipient TEXT NOT NULL CHECK (length(trim(recipient)) > 0),
          status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
          idempotency_key TEXT UNIQUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      db.exec(`
        INSERT INTO transactions_new (id, amount_minor, currency, recipient, status, idempotency_key, created_at)
        SELECT id, amount_minor, CASE WHEN currency = 'GBP' THEN 'INR' ELSE currency END, recipient, status, idempotency_key, created_at
        FROM transactions;
      `);
      db.exec('DROP TABLE transactions;');
      db.exec('ALTER TABLE transactions_new RENAME TO transactions;');
      db.exec(CREATE_INDEXES);
      db.exec('COMMIT;');
      db.pragma('foreign_keys = ON');
    }
  } catch (err) {
    // Migration fallback
  }

  activeDatabaseInstance = db;
  activeDatabasePath = targetPath;

  return db;
}

/**
 * Safely closes the active database connection.
 */
export function closeDatabase(db?: Database.Database): void {
  const instanceToClose = db || activeDatabaseInstance;
  if (instanceToClose && instanceToClose.open) {
    instanceToClose.close();
  }
  if (!db || db === activeDatabaseInstance) {
    activeDatabaseInstance = null;
    activeDatabasePath = null;
  }
}
