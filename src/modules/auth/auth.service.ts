import { prisma } from '../../config/db';
import { signToken } from '../../common/utils/jwt.util';
import { ApiError } from '../../common/middlewares/error.middleware';

// Dev-mode master OTP. Every login / register accepts this code so we can
// test end-to-end without a real SMS. Replace with Twilio Verify (or a random
// code stored per-mobile with a short TTL) before real launch.
const DEV_OTP = '1234';

function verifyOtp(otp: string): void {
  if (otp !== DEV_OTP) {
    throw new ApiError(401, 'That code is incorrect. Please try again.');
  }
}

export async function mobileExists(mobile: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { mobile } });
  return user !== null;
}

/**
 * "Sends" an OTP to the given mobile. During dev this is a no-op — the
 * hardcoded DEV_OTP (`1234`) is what login/register expect. Returns quickly
 * so the client can proceed to the OTP-entry screen.
 */
export async function sendOtp(mobile: string): Promise<{ sent: true; dev: boolean }> {
  // Intentionally no-op in dev; kept as a hook so we can wire Twilio Verify
  // here later without changing the client contract.
  void mobile;
  return { sent: true, dev: true };
}

/**
 * OTP-verified login. The mobile must already have an account; the OTP must
 * match the current dev master code.
 */
export async function login(mobile: string, otp: string): Promise<{ token: string; user: unknown }> {
  verifyOtp(otp);
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
  verifyOtp(input.otp);
  const existing = await prisma.user.findUnique({ where: { mobile: input.mobile } });
  if (existing) {
    throw new ApiError(409, 'An account with this mobile number already exists. Please login instead.');
  }

  const user = await prisma.user.create({
    data: {
      mobile: input.mobile,
      fullName: input.fullName,
      email: input.email,
    },
  });
  const token = signToken({ userId: user.id, mobile: user.mobile });
  return { token, user };
}
