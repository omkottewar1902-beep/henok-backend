import { z } from 'zod';

export const blockCallerSchema = z.object({
  identifier: z.string().trim().min(1, 'A caller identifier is required'),
  reason: z.string().trim().optional(),
});
