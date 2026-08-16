import { prisma } from '../../config/db';
import { signToken } from '../../common/utils/jwt.util';
import { ApiError } from '../../common/middlewares/error.middleware';

export async function mobileExists(mobile: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { mobile } });
  return user !== null;
}

/**
 * Passwordless login by mobile number only, per spec (no OTP step). Note: this means
 * knowledge of a phone number is sufficient to authenticate as that user - see the
 * README security notes for the recommended Twilio Verify OTP hardening.
 */
export async function login(mobile: string): Promise<{ token: string; user: unknown }> {
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
}): Promise<{ token: string; user: unknown }> {
  const existing = await prisma.user.findUnique({ where: { mobile: input.mobile } });
  if (existing) {
    throw new ApiError(409, 'An account with this mobile number already exists. Please login instead.');
  }

  const user = await prisma.user.create({ data: input });
  const token = signToken({ userId: user.id, mobile: user.mobile });
  return { token, user };
}
