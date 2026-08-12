import { Router } from 'express';
import * as paymentsController from './payments.controller';
import { createCheckoutSessionSchema } from './payments.validation';
import { validateBody } from '../../common/middlewares/validate';
import { requireAuth } from '../../common/middlewares/auth.middleware';

const router = Router();

/**
 * @openapi
 * /api/payments:
 *   get:
 *     tags: [Payments]
 *     summary: Payment History - the current user's payments, newest first
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of payments }
 */
router.get('/', requireAuth, paymentsController.list);

/**
 * @openapi
 * /api/payments/checkout-session:
 *   post:
 *     tags: [Payments]
 *     summary: Create a $5 Stripe Checkout Session for a pending QR
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [qrId]
 *             properties:
 *               qrId: { type: string }
 *     responses:
 *       200: { description: Stripe Checkout URL to redirect the user to }
 */
router.post(
  '/checkout-session',
  requireAuth,
  validateBody(createCheckoutSessionSchema),
  paymentsController.createCheckoutSession,
);

/**
 * @openapi
 * /api/payments/success:
 *   get:
 *     tags: [Payments]
 *     summary: Stripe Checkout success redirect landing page
 *     responses:
 *       200: { description: HTML confirmation page }
 */
router.get('/success', paymentsController.success);

/**
 * @openapi
 * /api/payments/cancel:
 *   get:
 *     tags: [Payments]
 *     summary: Stripe Checkout cancel redirect landing page
 *     responses:
 *       200: { description: HTML cancellation page }
 */
router.get('/cancel', paymentsController.cancel);

export default router;
