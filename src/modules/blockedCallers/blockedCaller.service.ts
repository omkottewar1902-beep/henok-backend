import { prisma } from '../../config/db';
import { ApiError } from '../../common/middlewares/error.middleware';
import { assertQrOwnership } from '../qr/qr.service';

export async function list(userId: string, qrId: string) {
  await assertQrOwnership(userId, qrId);
  return prisma.blockedCaller.findMany({ where: { qrId }, orderBy: { createdAt: 'desc' } });
}

export async function block(userId: string, qrId: string, identifier: string, reason?: string) {
  await assertQrOwnership(userId, qrId);
  return prisma.blockedCaller.upsert({
    where: { qrId_identifier: { qrId, identifier } },
    update: { reason },
    create: { qrId, identifier, reason },
  });
}

export async function unblock(userId: string, qrId: string, blockedId: string): Promise<void> {
  await assertQrOwnership(userId, qrId);
  const record = await prisma.blockedCaller.findUnique({ where: { id: blockedId } });
  if (!record || record.qrId !== qrId) {
    throw new ApiError(404, 'Blocked caller record not found');
  }
  await prisma.blockedCaller.delete({ where: { id: blockedId } });
}

/** Used by the public call-initiate flow (no auth) to reject calls from blocked identifiers. */
export async function isBlocked(qrId: string, identifier: string): Promise<boolean> {
  const record = await prisma.blockedCaller.findUnique({ where: { qrId_identifier: { qrId, identifier } } });
  return record !== null;
}
