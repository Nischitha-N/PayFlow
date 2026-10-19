import { Router, Request, Response, NextFunction } from 'express';
import {
  PaymentService,
  ValidationError,
  IdempotencyConflictError,
} from '../services/payment.service';

/**
 * Creates and configures the payments REST router.
 * Accepts an optional PaymentService instance for dependency injection in tests.
 */
export function createPaymentRouter(service: PaymentService = new PaymentService()): Router {
  const router = Router();

  /**
   * POST /api/payments
   * Creates a new payment transaction or re適ly returns an existing one if idempotent.
   */
  router.post('/', (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Request body must be a valid JSON object.',
          },
        });
        return;
      }

      // Check header first, fallback to payload idempotencyKey
      const idempotencyKey =
        (req.header('x-idempotency-key') as string | undefined) ||
        (req.body.idempotencyKey as string | undefined);

      const payload = {
        amountMinor: req.body.amountMinor,
        currency: req.body.currency,
        recipient: req.body.recipient,
        idempotencyKey,
      };

      const result = service.createPayment(payload);

      if (result.isExisting) {
        res.status(200).json({
          data: result.transaction,
        });
      } else {
        res.status(201).json({
          data: result.transaction,
        });
      }
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        res.status(422).json({
          error: {
            code: err.code,
            message: err.message,
          },
        });
        return;
      }

      if (err instanceof IdempotencyConflictError) {
        res.status(409).json({
          error: {
            code: err.code,
            message: err.message,
          },
        });
        return;
      }

      next(err);
    }
  });

  /**
   * GET /api/payments
   * Retrieves transaction history list.
   */
  router.get('/', (req: Request, res: Response, next: NextFunction): void => {
    try {
      const limitQuery = req.query.limit;
      let limit = 100;
      if (typeof limitQuery === 'string') {
        const parsed = parseInt(limitQuery, 10);
        if (!isNaN(parsed) && parsed > 0) {
          limit = Math.min(parsed, 100);
        }
      }

      const transactions = service.listPayments(limit);
      res.status(200).json({
        data: transactions,
      });
    } catch (err: unknown) {
      next(err);
    }
  });

  /**
   * GET /api/payments/:id
   * Retrieves a single transaction by ID.
   */
  router.get('/:id', (req: Request, res: Response, next: NextFunction): void => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const transaction = service.getPaymentById(id);

      if (!transaction) {
        res.status(404).json({
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: `Transaction with ID '${id}' was not found.`,
          },
        });
        return;
      }

      res.status(200).json({
        data: transaction,
      });
    } catch (err: unknown) {
      next(err);
    }
  });

  return router;
}
