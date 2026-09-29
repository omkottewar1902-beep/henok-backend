import { z } from 'zod';
import { normalizeUsMobile } from '../../common/utils/phone.util';

const mobileField = z
  .string()
  .refine((val) => normalizeUsMobile(val) !== null, {
    message: 'Must be a valid USA mobile number',
  })
  .transform((val) => normalizeUsMobile(val) as string);

// 4-digit numeric OTP. During dev / soft launch this is hardcoded to "1234"
// server-side (see auth.service.ts). Swap to Twilio Verify before real launch.
const otpField = z
  .string()
  .regex(/^\d{4}$/, 'Enter the 4-digit code');

export const checkMobileSchema = z.object({
  mobile: mobileField,
});

export const sendOtpSchema = z.object({
  mobile: mobileField,
});

export const registerSchema = z.object({
  mobile: mobileField,
  fullName: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().email('A valid email address is required'),
  otp: otpField,
});

export const loginSchema = z.object({
  mobile: mobileField,
  otp: otpField,
});
