import { z } from 'zod';
import { normalizeUsMobile } from '../../common/utils/phone.util';

const mobileField = z
  .string()
  .refine((val) => normalizeUsMobile(val) !== null, {
    message: 'Must be a valid USA mobile number',
  })
  .transform((val) => normalizeUsMobile(val) as string);

export const checkMobileSchema = z.object({
  mobile: mobileField,
});

export const registerSchema = z.object({
  mobile: mobileField,
  fullName: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().email('A valid email address is required'),
});

export const loginSchema = z.object({
  mobile: mobileField,
});
