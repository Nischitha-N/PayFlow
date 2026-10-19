/**
 * DDL Schema for PayFlow SQLite database.
 * Defines the transactions table, constraints, and indexes.
 */
export const CREATE_TRANSACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR', 'INR')),
  recipient TEXT NOT NULL CHECK (length(trim(recipient)) > 0),
  status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_transactions_created_at 
ON transactions(created_at DESC);
`;
