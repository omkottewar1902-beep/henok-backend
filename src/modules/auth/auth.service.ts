import { prisma } from '../../config/db';
import { signToken } from '../../common/utils/jwt.util';
import { ApiError } from '../../common/middlewares/error.middleware';

/**
 * Testing-only OTP. Overridable via `HARDCODED_OTP` env var so QA can rotate
 * without a redeploy. This is a placeholder for real Twilio Verify — see the
 * README security notes.
 */
const HARDCODED_OTP = process.env.HARDCODED_OTP ?? '1234';

function assertValidOtp(otp: string): void {
  if (otp !== HARDCODED_OTP) {
    throw new ApiError(401, 'Invalid or expired OTP.');
  }
}

export async function mobileExists(mobile: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { mobile } });
  return user !== null;
}

/**
 * "Send" an OTP. There's no real delivery yet — the code is always the value of
 * `HARDCODED_OTP`. We keep this endpoint on the surface so the mobile flow
 * (enter mobile → screen for OTP → verify) matches what production will look
 * like once Twilio Verify is wired in.
 */
export async function sendOtp(_mobile: string): Promise<{ sent: true }> {
  return { sent: true };
}

/**
 * Passwordless login by mobile number + OTP (currently a hardcoded test value).
 * Note: until Twilio Verify is wired up, knowledge of a phone number + the
 * hardcoded OTP is sufficient to authenticate as that user — see the README
 * security notes.
 */
export async function login(mobile: string, otp: string): Promise<{ token: string; user: unknown }> {
  assertValidOtp(otp);
  const user = await prisma.user.findUnique({ where: { mobile } });
  if (!user) {
    throw new ApiError(404, 'No account found for this mobile number. Please register first.');
  }
  const token = signToken({ userId: user.id, mobile: user.mobile });
  return { token, user };
}

export async function register(input: {
  mobile: string;
  fullName: string;
  email: string;
  otp: string;
}): Promise<{ token: string; user: unknown }> {
  assertValidOtp(input.otp);

  const existing = await prisma.user.findUnique({ where: { mobile: input.mobile } });
  if (existing) {
    throw new ApiError(409, 'An account with this mobile number already exists. Please login instead.');
  }

  const user = await prisma.user.create({
    data: { mobile: input.mobile, fullName: input.fullName, email: input.email },
  });
  const token = signToken({ userId: user.id, mobile: user.mobile });
  return { token, user };
}
