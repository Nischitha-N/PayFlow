/**
 * Supported ISO 4217 currencies (all configured for 2 decimal minor units).
 */
export type SupportedCurrency = 'USD' | 'EUR' | 'INR';

export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] = ['USD', 'EUR', 'INR'] as const;

/**
 * Payment transaction status.
 */
export type TransactionStatus = 'COMPLETED' | 'FAILED';

/**
 * Payment creation payload contract.
 * Note: `amountMinor` must be a positive integer representing the currency's minor units (e.g. 1050 = $10.50).
 */
export interface CreatePaymentPayload {
  amountMinor: number;
  currency: SupportedCurrency;
  recipient: string;
  idempotencyKey?: string;
}

/**
 * Payment transaction database and API response record.
 */
export interface PaymentTransaction {
  id: string;
  amountMinor: number;
  currency: SupportedCurrency;
  recipient: string;
  status: TransactionStatus;
  idempotencyKey: string | null;
  createdAt: string;
}

/**
 * Standard API error response format.
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
