import { z } from 'zod';
import { normalizeUsMobile } from '../../common/utils/phone.util';

const mobileField = z
  .string()
  .refine((val) => normalizeUsMobile(val) !== null, {
    message: 'Must be a valid USA mobile number',
  })
  .transform((val) => normalizeUsMobile(val) as string);

/**
 * Testing shim: the app doesn't wire Twilio Verify yet, so we accept a hardcoded
 * OTP. The value is overridable via env (`HARDCODED_OTP`) so QA can rotate it
 * without a redeploy. Login/register both require this field before issuing a JWT.
 */
const otpField = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, 'OTP must be 4-6 digits');

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
