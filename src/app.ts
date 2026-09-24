import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { prisma } from './config/db';
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

  // Trust exactly one hop (Render's load balancer / any reverse proxy in front of this API).
  // Value `1` means we trust the first X-Forwarded-For entry only, so clients cannot spoof
  // it to bypass IP rate-limiting. Must be set unconditionally because Render injects
  // X-Forwarded-For in all environments, not only when NODE_ENV=production.
  app.set('trust proxy', 1);

  // CORS runs BEFORE helmet so preflight OPTIONS gets a proper
  // Access-Control-Allow-Origin response and short-circuits before helmet's
  // cross-origin policies can interfere. `origin: true` reflects the caller's
  // Origin header for every request, which covers:
  //   - Android/iOS emulators running the native Flutter app (no CORS anyway)
  //   - Flutter web on any localhost port
  //   - The scan page and any hosted web frontend
  // Lock this down later by swapping `origin: true` for an allow-list.
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
      exposedHeaders: ['Content-Disposition'],
      maxAge: 86400,
    }),
  );

  // Helmet with the Cross-Origin-Resource-Policy relaxed so browsers on other
  // origins (Flutter web, the scan page under a different host) can actually
  // consume responses from this API. Also whitelist the Twilio Voice SDK
  // origins in CSP so the scan page's masked-call flow can load `twilio.min.js`
  // from sdk.twilio.com and open the WebSocket to twilio.com for audio.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", 'https://sdk.twilio.com'],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
          // Twilio Voice SDK opens a signalling WebSocket to *.twilio.com and
          // fetches ICE server config over HTTPS from the same origin.
          connectSrc: ["'self'", 'https://*.twilio.com', 'wss://*.twilio.com'],
          // Audio streams from the SDK are exposed as blob URLs; some SDK
          // versions also spin up a Web Worker from a blob for jitter buffer.
          mediaSrc: ["'self'", 'blob:'],
          workerSrc: ["'self'", 'blob:'],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

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

  // Public product homepage — what Twilio A2P reviewers open first when
  // vetting the brand's domain.
  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  // Legal + compliance pages required for Twilio A2P 10DLC / Stripe / App
  // Store review. Kept as plain static HTML under public/legal so they render
  // even if the database is down.
  app.get('/privacy', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/legal/privacy.html'));
  });
  app.get('/terms', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/legal/terms.html'));
  });
  app.get('/sms-consent', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/legal/sms-consent.html'));
  });
  // Screenshots embedded in /sms-consent (A2P 10DLC evidence). Scoped to this
  // subfolder so raw legal .html files stay behind their pretty routes.
  app.use('/legal/screenshots', express.static(path.join(__dirname, '../public/legal/screenshots')));
  app.get('/sms-terms', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/legal/sms-terms.html'));
  });

  // Homepage waitlist form target. Persists the email to server logs for now
  // (dev team can wire to a real store or notification service later) and
  // returns a static thank-you page.
  app.post('/waitlist', (req, res) => {
    const raw = ((req.body as Record<string, unknown> | undefined)?.email ?? '').toString().trim();
    const email = raw.slice(0, 254);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      res.status(400).send('Please enter a valid email address.');
      return;
    }
    console.log(`[waitlist] ${new Date().toISOString()} ${email}`);
    res.sendFile(path.join(__dirname, '../public/legal/waitlist-thanks.html'));
  });

  // Publicly served uploaded images (Dog/Luggage photos)
  app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.get('/health', (req, res) => res.json({ status: 'ok', app: env.appName }));

  // Temporary admin seeding endpoint — creates an ACTIVE test QR bypassing
  // Stripe. Guarded by the ADMIN_SEED_TOKEN env var; returns 404 if the env
  // var isn't set OR the X-Admin-Token header doesn't match. Remove the env
  // var (and this route) once testing is done.
  app.post('/api/admin/seed-test-qr', async (req, res, next) => {
    try {
      const expected = env.adminSeedToken;
      const provided = req.headers['x-admin-token'];
      if (!expected || provided !== expected) {
        res.status(404).json({ message: "We couldn't find what you were looking for." });
        return;
      }

      const ownerName = 'Michael Thompson';
      const ownerMobile = '+19168336757';
      const ownerEmail = 'michael.thompson@jcscan2connect.com';

      const user = await prisma.user.upsert({
        where: { mobile: ownerMobile },
        update: { fullName: ownerName, email: ownerEmail },
        create: { fullName: ownerName, email: ownerEmail, mobile: ownerMobile },
      });

      const seqRows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
        SELECT nextval('qr_extension_number_seq') AS nextval
      `;
      const extensionNumber = seqRows[0].nextval.toString().padStart(5, '0');

      const qr = await prisma.qr.create({
        data: {
          type: 'CAR',
          status: 'ACTIVE',
          extensionNumber,
          ownerName,
          ownerMobile,
          ownerEmail,
          addressLine1: '2220 Fraser St',
          addressLine2: null,
          city: 'Aurora',
          state: 'CO',
          zipCode: '80014',
          userId: user.id,
          vehicle: {
            create: {
              vehicleNumber: 'CO-TEST-916',
              vehicleColor: 'Silver',
              speedAlertEnabled: false,
            },
          },
          emergencyContacts: {
            create: [
              {
                name: 'Secondary Contact',
                relationship: 'Friend',
                mobile: ownerMobile,
              },
            ],
          },
        },
        include: { vehicle: true, emergencyContacts: true },
      });

      const scanUrl = `${env.appBaseUrl}/scan/${qr.uniqueCode}`;
      res.json({
        qrId: qr.id,
        uniqueCode: qr.uniqueCode,
        extensionNumber: qr.extensionNumber,
        status: qr.status,
        ownerName: qr.ownerName,
        ownerMobile: qr.ownerMobile,
        vehicle: qr.vehicle?.vehicleNumber,
        contacts: qr.emergencyContacts.length,
        scanUrl,
      });
    } catch (err) {
      // Admin-token-guarded route — safe to return the raw error message so
      // we can debug without shell access to Render logs.
      const e = err as { name?: string; code?: string; meta?: unknown; message?: string; stack?: string };
      console.error('[admin/seed-test-qr]', e);
      res.status(500).json({
        error: e.name ?? 'Error',
        code: e.code,
        message: e.message ?? String(err),
        meta: e.meta,
      });
    }
  });

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
