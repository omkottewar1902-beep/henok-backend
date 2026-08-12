import { z } from 'zod';
import { normalizeUsMobile } from '../utils/phone.util';

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required'),
  relationship: z.string().trim().min(1, 'Relationship is required'),
  mobile: z
    .string()
    .refine((val) => normalizeUsMobile(val) !== null, { message: 'Must be a valid USA mobile number' })
    .transform((val) => normalizeUsMobile(val) as string),
});

export const emergencyContactsArraySchema = z
  .array(emergencyContactSchema)
  .max(3, 'A maximum of 3 emergency contacts is allowed');
