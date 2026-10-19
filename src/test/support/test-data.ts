import { CreatePaymentPayload } from '../../app/types';

let testRunCounter = 0;

/**
 * Generates an isolated recipient name unique to each test execution.
 */
export function generateUniqueRecipient(prefix = 'Acme Corp'): string {
  testRunCounter += 1;
  return `${prefix} ${Date.now()}_${testRunCounter}`;
}

/**
 * Generates an isolated idempotency key unique to each test execution.
 */
export function generateUniqueIdempotencyKey(prefix = 'idemp'): string {
  testRunCounter += 1;
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${Date.now()}_${testRunCounter}_${rand}`;
}

/**
 * Creates a valid default payment creation payload.
 */
export function createValidPaymentPayload(
  overrides: Partial<CreatePaymentPayload> = {}
): CreatePaymentPayload {
  return {
    amountMinor: 2500, // $25.00
    currency: 'USD',
    recipient: generateUniqueRecipient(),
    ...overrides,
  };
}
