import { z } from 'zod';

export const updateMeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').optional(),
  email: z.string().trim().email('A valid email address is required').optional(),
});
