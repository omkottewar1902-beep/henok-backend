import { prisma } from '../../config/db';
import { ApiError } from '../../common/middlewares/error.middleware';
import { CreateQrDraftInput } from './qr.validation';
import { createNotification } from '../notifications/notifications.service';

export const qrDetailInclude = {
  vehicle: true,
  dog: true,
  luggage: true,
  otherItem: true,
  emergencyContacts: true,
  payments: { orderBy: { createdAt: 'desc' as const }, take: 1 },
};

/**
 * Draws the next value from the "qr_extension_number_seq" Postgres sequence (starts at
 * 10001, see migration 20260818000000_extension_seq_restart_10001) and zero-pads it to 5 digits.
 * The sequence guarantees uniqueness under concurrent inserts without an app-level lock.
 */
async function generateExtensionNumber(): Promise<string> {
  const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('qr_extension_number_seq')`;
  return nextval.toString().padStart(5, '0');
}

/** The short label shown on "My QR" cards and the printable QR (vehicle #, dog name, bag/item name). */
export function displayLabel(qr: {
  type: string;
  vehicle?: { vehicleNumber: string } | null;
  dog?: { name: string } | null;
  luggage?: { bagDescription: string } | null;
  otherItem?: { itemName: string } | null;
}): string {
  switch (qr.type) {
    case 'CAR':
      return qr.vehicle?.vehicleNumber ?? 'Vehicle';
    case 'DOG':
      return qr.dog?.name ?? 'Dog';
    case 'LUGGAGE':
      return qr.luggage?.bagDescription ?? 'Luggage';
    default:
      return qr.otherItem?.itemName ?? 'Item';
  }
}

export async function createDraft(userId: string, input: CreateQrDraftInput) {
  const {
    type,
    ownerName,
    ownerMobile,
    ownerEmail,
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
    emergencyContacts,
    skipPayment,
  } = input;

  const commonData = {
    type,
    userId,
    ownerName,
    ownerMobile,
    ownerEmail,
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
    extensionNumber: await generateExtensionNumber(),
    emergencyContacts: { create: emergencyContacts },
    // Free QRs skip Stripe entirely and go straight to ACTIVE; paid ones default to PENDING_PAYMENT.
    status: skipPayment ? ('ACTIVE' as const) : undefined,
  };

  let qr;
  switch (input.type) {
    case 'CAR':
      qr = await prisma.qr.create({
        data: {
          ...commonData,
          vehicle: {
            create: {
              vehicleNumber: input.vehicleNumber,
              vehicleColor: input.vehicleColor,
              speedAlertEnabled: input.speedAlertEnabled,
            },
          },
        },
        include: qrDetailInclude,
      });
      break;
    case 'DOG':
      qr = await prisma.qr.create({
        data: {
          ...commonData,
          dog: { create: { name: input.name, breed: input.breed, photoUrl: input.photoUrl } },
        },
        include: qrDetailInclude,
      });
      break;
    case 'LUGGAGE':
      qr = await prisma.qr.create({
        data: {
          ...commonData,
          luggage: { create: { bagDescription: input.bagDescription, imageUrl: input.imageUrl } },
        },
        include: qrDetailInclude,
      });
      break;
    case 'OTHER':
      qr = await prisma.qr.create({
        data: {
          ...commonData,
          otherItem: { create: { itemName: input.itemName, description: input.description } },
        },
        include: qrDetailInclude,
      });
      break;
  }

  await createNotification(
    userId,
    'QR_CREATED',
    skipPayment ? 'QR Created' : 'QR Draft Created',
    skipPayment
      ? `Your ${displayLabel(qr)} QR is active and ready to use.`
      : `Your ${displayLabel(qr)} QR is ready for payment.`,
    { qrId: qr.id },
  );

  return qr;
}

export async function listByUser(userId: string) {
  return prisma.qr.findMany({ where: { userId }, include: qrDetailInclude, orderBy: { createdAt: 'desc' } });
}

export async function assertQrOwnership(userId: string, qrId: string) {
  const qr = await prisma.qr.findUnique({ where: { id: qrId } });
  if (!qr || qr.userId !== userId) {
    throw new ApiError(404, 'QR code not found');
  }
  return qr;
}

export async function getById(userId: string, qrId: string) {
  await assertQrOwnership(userId, qrId);
  return prisma.qr.findUnique({ where: { id: qrId }, include: qrDetailInclude });
}

export async function disable(userId: string, qrId: string) {
  await assertQrOwnership(userId, qrId);
  return prisma.qr.update({ where: { id: qrId }, data: { status: 'DISABLED' }, include: qrDetailInclude });
}

export async function enable(userId: string, qrId: string) {
  const qr = await assertQrOwnership(userId, qrId);
  if (qr.status === 'PENDING_PAYMENT') {
    throw new ApiError(400, 'This QR cannot be re-enabled until payment is completed');
  }
  return prisma.qr.update({ where: { id: qrId }, data: { status: 'ACTIVE' }, include: qrDetailInclude });
}

interface UpdateQrInfoInput {
  ownerName?: string;
  ownerMobile?: string;
  ownerEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  vehicleNumber?: string;
  vehicleColor?: string;
  speedAlertEnabled?: boolean;
  name?: string;
  breed?: string;
  photoUrl?: string;
  bagDescription?: string;
  imageUrl?: string;
  itemName?: string;
  description?: string;
}

export async function updateInfo(userId: string, qrId: string, input: UpdateQrInfoInput) {
  const qr = await assertQrOwnership(userId, qrId);

  const {
    vehicleNumber,
    vehicleColor,
    speedAlertEnabled,
    name,
    breed,
    photoUrl,
    bagDescription,
    imageUrl,
    itemName,
    description,
    ...commonUpdate
  } = input;

  if (Object.keys(commonUpdate).length > 0) {
    await prisma.qr.update({ where: { id: qrId }, data: commonUpdate });
  }

  switch (qr.type) {
    case 'CAR':
      await prisma.vehicle.update({
        where: { qrId },
        data: { vehicleNumber, vehicleColor, speedAlertEnabled },
      });
      break;
    case 'DOG':
      await prisma.dog.update({ where: { qrId }, data: { name, breed, photoUrl } });
      break;
    case 'LUGGAGE':
      await prisma.luggage.update({ where: { qrId }, data: { bagDescription, imageUrl } });
      break;
    case 'OTHER':
      await prisma.otherItem.update({ where: { qrId }, data: { itemName, description } });
      break;
  }

  return getById(userId, qrId);
}
