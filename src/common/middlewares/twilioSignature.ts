import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { env } from '../../config/env';

/**
 * Verifies the X-Twilio-Signature header on inbound Twilio webhooks so only
 * Twilio itself can trigger call-status updates / voice TwiML lookups.
 */
export function verifyTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  if (env.nodeEnv !== 'production' && env.twilioAuthToken === 'placeholder') {
    // No real Twilio credentials configured yet - skip verification in dev so the
    // webhook can still be exercised manually/with curl during local development.
    next();
    return;
  }

  const signature = req.headers['x-twilio-signature'];
  const fullUrl = `${env.appBaseUrl}${req.originalUrl}`;
  const isValid =
    typeof signature === 'string' &&
    twilio.validateRequest(env.twilioAuthToken, signature, fullUrl, req.body as Record<string, string>);

  if (!isValid) {
    res.status(403).json({ message: 'Invalid Twilio signature' });
    return;
  }

  next();
}
