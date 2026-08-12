import { prisma } from '../../config/db';
import { ApiError } from '../../common/middlewares/error.middleware';
import { assertQrOwnership } from '../qr/qr.service';
import { EmergencyContactInput } from './emergencyContact.validation';

const MAX_CONTACTS_PER_QR = 3;

export async function list(userId: string, qrId: string) {
  await assertQrOwnership(userId, qrId);
  return prisma.emergencyContact.findMany({ where: { qrId }, orderBy: { createdAt: 'asc' } });
}

export async function add(userId: string, qrId: string, input: EmergencyContactInput) {
  await assertQrOwnership(userId, qrId);

  const count = await prisma.emergencyContact.count({ where: { qrId } });
  if (count >= MAX_CONTACTS_PER_QR) {
    throw new ApiError(400, `A maximum of ${MAX_CONTACTS_PER_QR} emergency contacts is allowed per QR`);
  }

  return prisma.emergencyContact.create({ data: { ...input, qrId } });
}

export async function update(userId: string, qrId: string, contactId: string, input: Partial<EmergencyContactInput>) {
  await assertQrOwnership(userId, qrId);
  const contact = await prisma.emergencyContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.qrId !== qrId) {
    throw new ApiError(404, 'Emergency contact not found');
  }
  return prisma.emergencyContact.update({ where: { id: contactId }, data: input });
}

export async function remove(userId: string, qrId: string, contactId: string): Promise<void> {
  await assertQrOwnership(userId, qrId);
  const contact = await prisma.emergencyContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.qrId !== qrId) {
    throw new ApiError(404, 'Emergency contact not found');
  }
  await prisma.emergencyContact.delete({ where: { id: contactId } });
}
