import { Request, Response, NextFunction } from 'express';

/**
 * Global error handling middleware.
 * Ensures all errors conform to the standard ApiErrorResponse shape and do not leak stack traces.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // Handle JSON parsing syntax error from body-parser
  if (err instanceof SyntaxError && 'status' in err && (err as { status: unknown }).status === 400 && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload in request body.',
      },
    });
    return;
  }

  // Generic 500 error for unexpected server issues
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
    },
  });
}
