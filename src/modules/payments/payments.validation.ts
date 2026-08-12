import { z } from 'zod';

export const createCheckoutSessionSchema = z.object({
  qrId: z.string().uuid('A valid QR id is required'),
});
