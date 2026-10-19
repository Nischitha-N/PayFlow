import crypto from 'crypto';
import Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  CreatePaymentPayload,
  PaymentTransaction,
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from '../types';

export class ValidationError extends Error {
  public readonly code: string;
  constructor(message: string, code = 'INVALID_INPUT') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

export class IdempotencyConflictError extends Error {
  public readonly code = 'IDEMPOTENCY_CONFLICT';
  constructor(message = 'Idempotency key reused with different parameters') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class NotFoundError extends Error {
  public readonly code = 'TRANSACTION_NOT_FOUND';
  constructor(message = 'Transaction not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

interface TransactionRow {
  id: string;
  amount_minor: number;
  currency: string;
  recipient: string;
  status: string;
  idempotency_key: string | null;
  created_at: string;
}

export class PaymentService {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  /**
   * Validates payment creation input according to strict minor-unit monetary rules.
   */
  private validatePayload(payload: CreatePaymentPayload): {
    amountMinor: number;
    currency: SupportedCurrency;
    recipient: string;
    idempotencyKey: string | null;
  } {
    const { amountMinor, currency, recipient, idempotencyKey } = payload;

    if (amountMinor === undefined || amountMinor === null) {
      throw new ValidationError('amountMinor is required', 'MISSING_AMOUNT');
    }

    if (typeof amountMinor !== 'number' || !Number.isInteger(amountMinor)) {
      throw new ValidationError('amountMinor must be an integer representing minor units (e.g. 1000 for $10.00)', 'INVALID_AMOUNT_FORMAT');
    }

    if (amountMinor <= 0) {
      throw new ValidationError('amountMinor must be a positive integer greater than 0', 'INVALID_AMOUNT_VALUE');
    }

    if (!currency) {
      throw new ValidationError('currency is required', 'MISSING_CURRENCY');
    }

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new ValidationError(
        `Unsupported currency '${currency}'. Supported currencies are: ${SUPPORTED_CURRENCIES.join(', ')}`,
        'UNSUPPORTED_CURRENCY'
      );
    }

    if (!recipient || typeof recipient !== 'string' || recipient.trim().length === 0) {
      throw new ValidationError('recipient must be a non-empty string', 'INVALID_RECIPIENT');
    }

    const cleanIdempotencyKey = idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0
      ? idempotencyKey.trim()
      : null;

    return {
      amountMinor,
      currency,
      recipient: recipient.trim(),
      idempotencyKey: cleanIdempotencyKey,
    };
  }

  private mapRow(row: TransactionRow): PaymentTransaction {
    return {
      id: row.id,
      amountMinor: row.amount_minor,
      currency: row.currency as SupportedCurrency,
      recipient: row.recipient,
      status: row.status as PaymentTransaction['status'],
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
    };
  }

  /**
   * Creates a payment transaction with idempotency enforcement.
   */
  public createPayment(payload: CreatePaymentPayload): {
    transaction: PaymentTransaction;
    isExisting: boolean;
  } {
    const validated = this.validatePayload(payload);

    // Check for existing transaction if idempotencyKey is supplied
    if (validated.idempotencyKey) {
      const existing = this.db
        .prepare<[string], TransactionRow>(
          'SELECT * FROM transactions WHERE idempotency_key = ?'
        )
        .get(validated.idempotencyKey);

      if (existing) {
        const matches =
          existing.amount_minor === validated.amountMinor &&
          existing.currency === validated.currency &&
          existing.recipient === validated.recipient;

        if (matches) {
          return {
            transaction: this.mapRow(existing),
            isExisting: true,
          };
        } else {
          throw new IdempotencyConflictError();
        }
      }
    }

    const transactionId = `txn_${crypto.randomUUID()}`;
    const status = 'COMPLETED';

    try {
      const stmt = this.db.prepare<
        [string, number, string, string, string, string | null]
      >(`
        INSERT INTO transactions (id, amount_minor, currency, recipient, status, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        transactionId,
        validated.amountMinor,
        validated.currency,
        validated.recipient,
        status,
        validated.idempotencyKey
      );

      const created = this.db
        .prepare<[string], TransactionRow>(
          'SELECT * FROM transactions WHERE id = ?'
        )
        .get(transactionId);

      if (!created) {
        throw new Error('Failed to retrieve newly inserted transaction');
      }

      return {
        transaction: this.mapRow(created),
        isExisting: false,
      };
    } catch (error: unknown) {
      // Handle potential race-condition where another insert with same idempotency key succeeded
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed: transactions.idempotency_key') &&
        validated.idempotencyKey
      ) {
        const existing = this.db
          .prepare<[string], TransactionRow>(
            'SELECT * FROM transactions WHERE idempotency_key = ?'
          )
          .get(validated.idempotencyKey);

        if (existing) {
          const matches =
            existing.amount_minor === validated.amountMinor &&
            existing.currency === validated.currency &&
            existing.recipient === validated.recipient;

          if (matches) {
            return {
              transaction: this.mapRow(existing),
              isExisting: true,
            };
          }
        }
        throw new IdempotencyConflictError();
      }
      throw error;
    }
  }

  /**
   * Retrieves a single transaction by ID.
   */
  public getPaymentById(id: string): PaymentTransaction | null {
    if (!id || typeof id !== 'string') {
      return null;
    }

    const row = this.db
      .prepare<[string], TransactionRow>(
        'SELECT * FROM transactions WHERE id = ?'
      )
      .get(id);

    return row ? this.mapRow(row) : null;
  }

  /**
   * Lists transactions ordered by created_at DESC.
   */
  public listPayments(limit = 100): PaymentTransaction[] {
    const rows = this.db
      .prepare<[number], TransactionRow>(
        'SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?'
      )
      .all(limit);

    return rows.map((row) => this.mapRow(row));
  }
}
