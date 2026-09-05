import { z } from 'zod';

export const createCheckoutSessionSchema = z.object({
  qrId: z.string().uuid('A valid QR id is required'),
});

export const syncSessionSchema = z.object({
  sessionId: z
    .string()
    .min(1, 'sessionId is required')
    .regex(/^cs_(test|live)_/, 'Not a valid Stripe Checkout Session id'),
});
