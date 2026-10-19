import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config';

/**
 * Authentication middleware that verifies the 'x-api-key' request header.
 * Rejects unauthenticated requests with HTTP 401.
 */
export function authenticateApiKey(req: Request, res: Response, next: NextFunction): void {
  const configuredApiKey = getConfig().apiKey;

  // Fail-safe check: if the server has no configured API key, do not allow unauthenticated access
  if (!configuredApiKey || typeof configuredApiKey !== 'string' || configuredApiKey.trim() === '') {
    res.status(500).json({
      error: {
        code: 'AUTH_CONFIGURATION_ERROR',
        message: 'Server authentication is improperly configured. Access denied.',
      },
    });
    return;
  }

  const providedApiKey = req.header('x-api-key');

  if (!providedApiKey) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: "Missing 'x-api-key' header. Please supply a valid API key.",
      },
    });
    return;
  }

  if (providedApiKey !== configuredApiKey) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: "Invalid 'x-api-key' provided.",
      },
    });
    return;
  }

  next();
}
