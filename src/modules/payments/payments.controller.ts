import { Request, Response, NextFunction } from 'express';
import { AuthedRequest } from '../../common/middlewares/auth.middleware';
import * as paymentsService from './payments.service';

export async function list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payments = await paymentsService.listForUser(req.userId!);
    res.json(payments);
  } catch (err) {
    next(err);
  }
}

export async function createCheckoutSession(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await paymentsService.createCheckoutSession(req.userId!, req.body.qrId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Client-callable fallback for the post-redirect flow. Fetches the session
 * fresh from Stripe and runs the same idempotent fulfillment as the webhook,
 * so a slow webhook can't leave the QR stuck in PENDING_PAYMENT after the
 * user is already back in the app.
 */
export async function syncSession(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await paymentsService.syncSession(req.userId!, req.body.sessionId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      res.status(400).json({ message: 'Missing Stripe-Signature header' });
      return;
    }
    await paymentsService.handleWebhookEvent(req.body as Buffer, signature);
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}

export function success(req: Request, res: Response): void {
  res.send('<h1>Payment successful</h1><p>You can return to the JCSafeScan app to view your QR.</p>');
}

export function cancel(req: Request, res: Response): void {
  res.send('<h1>Payment canceled</h1><p>No charge was made. You can retry payment from the app.</p>');
}
