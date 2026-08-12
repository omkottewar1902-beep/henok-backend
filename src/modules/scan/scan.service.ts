import { Request } from 'express';
import { prisma } from '../../config/db';
import { ApiError } from '../../common/middlewares/error.middleware';
import { maskMobile, maskName } from '../../common/utils/mask.util';
import { extractDeviceInfo } from '../../common/utils/device.util';
import { assertQrOwnership, displayLabel, qrDetailInclude } from '../qr/qr.service';
import { createNotification } from '../notifications/notifications.service';

export async function getPublicQrData(uniqueCode: string) {
  const qr = await prisma.qr.findUnique({ where: { uniqueCode }, include: qrDetailInclude });

  if (!qr || qr.status !== 'ACTIVE') {
    throw new ApiError(404, 'This QR code is not active');
  }

  return {
    qrId: qr.id,
    type: qr.type,
    label: displayLabel(qr),
    owner: {
      name: maskName(qr.ownerName),
      mobile: maskMobile(qr.ownerMobile),
    },
    emergencyContacts: qr.emergencyContacts.map((c) => ({
      id: c.id,
      name: maskName(c.name),
      relationship: c.relationship,
      mobile: maskMobile(c.mobile),
    })),
  };
}

/** Owner-facing scan history (Scan History tab), newest first, with a ready-to-block identifier per entry. */
export async function listScanLogsForOwner(userId: string, qrId: string) {
  await assertQrOwnership(userId, qrId);
  const logs = await prisma.scanLog.findMany({ where: { qrId }, orderBy: { createdAt: 'desc' } });
  return logs.map((log) => ({
    ...log,
    blockIdentifier: `${log.ipAddress}|${log.browser}|${log.device}`,
  }));
}

interface LogScanOptions {
  latitude?: number;
  longitude?: number;
}

export async function logScan(
  qrId: string,
  req: Request,
  action: 'VIEWED' | 'CALL_OWNER' | 'CALL_EMERGENCY',
  options: LogScanOptions = {},
) {
  const { ipAddress, browser, device } = extractDeviceInfo(req);

  const scanLog = await prisma.scanLog.create({
    data: {
      qrId,
      ipAddress,
      browser,
      device,
      latitude: options.latitude,
      longitude: options.longitude,
      actionTaken: action,
    },
  });

  if (action === 'VIEWED') {
    const qr = await prisma.qr.findUnique({ where: { id: qrId } });
    if (qr) {
      await createNotification(
        qr.userId,
        'QR_SCANNED',
        'QR Scanned',
        `Someone scanned the QR for your ${qr.type.toLowerCase()}.`,
        { qrId },
      );
    }
  }

  return scanLog;
}
