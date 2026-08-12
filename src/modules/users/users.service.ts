import { prisma } from '../../config/db';
import { ApiError } from '../../common/middlewares/error.middleware';

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return user;
}

interface UpdateMeInput {
  fullName?: string;
  email?: string;
}

/** Mobile is immutable - it's the passwordless login identity, not an editable profile field. */
export async function updateMe(userId: string, input: UpdateMeInput) {
  return prisma.user.update({ where: { id: userId }, data: input });
}
