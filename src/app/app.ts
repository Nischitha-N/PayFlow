import path from 'path';
import fs from 'fs';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { authenticateApiKey } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { createPaymentRouter } from './routes/payments';
import { PaymentService } from './services/payment.service';

export interface CreateAppOptions {
  paymentService?: PaymentService;
}

/**
 * Express application factory.
 * Configures middleware, routes, authentication, and error handling.
 */
export function createApp(options: CreateAppOptions = {}): Application {
  const app = express();

  // Basic middleware
  app.use(cors());
  app.use(express.json());

  // Determine public assets directory (supports both tsx and compiled dist execution)
  const publicDir = fs.existsSync(path.resolve(__dirname, 'public'))
    ? path.resolve(__dirname, 'public')
    : path.resolve(process.cwd(), 'src', 'app', 'public');

  // Serve static assets and dashboard
  app.use(express.static(publicDir));
  app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Public health check endpoint (unauthenticated)
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Protected REST API routes
  const paymentService = options.paymentService || new PaymentService();
  app.use('/api/payments', authenticateApiKey, createPaymentRouter(paymentService));

  // Global error handler
  app.use(errorHandler);

  return app;
}
