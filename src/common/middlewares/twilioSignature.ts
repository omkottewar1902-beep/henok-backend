import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { env } from '../../config/env';

/**
 * Verifies the X-Twilio-Signature header on inbound Twilio webhooks so only
 * Twilio itself can trigger call-status updates / voice TwiML lookups.
 *
 * The signed URL is derived from the actual incoming request (protocol + host
 * + originalUrl) instead of env.appBaseUrl. Twilio computes the HMAC against
 * the URL it POSTed to — so we must reconstruct exactly that URL, regardless
 * of what APP_BASE_URL is configured to. `app.set('trust proxy', 1)` in
 * app.ts makes `req.protocol` and `req.get('host')` honour the
 * X-Forwarded-* headers Render / Cloudflare inject.
 */
export function verifyTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  if (env.nodeEnv !== 'production' && env.twilioAuthToken === 'placeholder') {
    // No real Twilio credentials configured yet - skip verification in dev so the
    // webhook can still be exercised manually/with curl during local development.
    next();
    return;
  }

  const signature = req.headers['x-twilio-signature'];
  const host = req.get('host');
  const proto = req.protocol;
  const fullUrl = `${proto}://${host}${req.originalUrl}`;

  const isValid =
    typeof signature === 'string' &&
    twilio.validateRequest(
      env.twilioAuthToken,
      signature,
      fullUrl,
      req.body as Record<string, string>,
    );

  if (!isValid) {
    console.warn(
      `[twilio-signature] REJECT  url=${fullUrl}  sig=${typeof signature === 'string' ? signature.slice(0, 12) + '…' : 'missing'}  bodyKeys=[${Object.keys(req.body ?? {}).join(',')}]`,
    );
    res.status(403).json({ message: 'Invalid Twilio signature' });
    return;
  }

  console.log(`[twilio-signature] ok  url=${fullUrl}`);
  next();
}
