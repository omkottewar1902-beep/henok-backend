import { z } from 'zod';

export const initiateCallSchema = z.object({
  qrId: z.string().uuid('A valid QR id is required'),
  targetType: z.enum(['OWNER', 'EMERGENCY']),
  contactId: z.string().uuid().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});
