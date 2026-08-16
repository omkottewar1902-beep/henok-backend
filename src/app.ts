import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { swaggerSpec } from './swagger/swagger';
import { defaultLimiter } from './common/middlewares/rateLimiter';
import { notFoundHandler, errorHandler } from './common/middlewares/error.middleware';
import * as paymentsController from './modules/payments/payments.controller';

import authRoutes from './modules/auth/auth.routes';
import qrRoutes from './modules/qr/qr.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import scanRoutes from './modules/scan/scan.routes';
import callsRoutes from './modules/calls/calls.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import uploadsRoutes from './modules/uploads/uploads.routes';
import usersRoutes from './modules/users/users.routes';

export function createApp(): Express {
  const app = express();

  // Trust exactly one hop (the load balancer/reverse proxy in front of the API in production).
  // `true` would trust every hop and let clients spoof X-Forwarded-For to bypass IP rate limiting.
  app.set('trust proxy', env.nodeEnv === 'production' ? 1 : false);
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

  // Stripe requires the raw request body to verify webhook signatures, so this route
  // must be registered before the global express.json() body parser below.
  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentsController.webhook);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false })); // Twilio webhooks post form-encoded bodies
  app.use(defaultLimiter);

  // Public "SCAN & CALL" web page - served for any /scan/:code, static assets first.
  app.use('/scan', express.static(path.join(__dirname, '../public/scan')));
  app.get('/scan/:code', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/scan/index.html'));
  });

  // Publicly served uploaded images (Dog/Luggage photos)
  app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.get('/health', (req, res) => res.json({ status: 'ok', app: env.appName }));

  app.use('/api/auth', authRoutes);
  app.use('/api/qr', qrRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/scan', scanRoutes);
  app.use('/api/calls', callsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/uploads', uploadsRoutes);
  app.use('/api/users', usersRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
