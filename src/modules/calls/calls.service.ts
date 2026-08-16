import { Request } from 'express';
import { v4 as uuid } from 'uuid';
import twilio from 'twilio';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { twilioClient, AccessToken, VoiceGrant } from '../../config/twilio';
import { ApiError } from '../../common/middlewares/error.middleware';
import { callerFingerprint, extractDeviceInfo } from '../../common/utils/device.util';
import { displayLabel, assertQrOwnership } from '../qr/qr.service';
import { logScan } from '../scan/scan.service';
import { isBlocked } from '../blockedCallers/blockedCaller.service';
import { createNotification } from '../notifications/notifications.service';

interface InitiateCallInput {
  qrId: string;
  targetType: 'OWNER' | 'EMERGENCY';
  contactId?: string;
  latitude?: number;
  longitude?: number;
}

export async function initiateCall(input: InitiateCallInput, req: Request) {
  const qr = await prisma.qr.findUnique({
    where: { id: input.qrId },
    include: { emergencyContacts: true, vehicle: true, dog: true, luggage: true, otherItem: true },
  });

  if (!qr || qr.status !== 'ACTIVE') {
    throw new ApiError(404, 'This QR code is not active');
  }

  const callerRef = callerFingerprint(req);
  if (await isBlocked(qr.id, callerRef)) {
    throw new ApiError(403, 'You have been blocked from contacting this QR');
  }

  const label = displayLabel(qr);
  let targetMobile: string;
  let smsRecipients: string[];
  let smsBody: string;

  if (input.targetType === 'OWNER') {
    targetMobile = qr.ownerMobile;
    smsRecipients = [qr.ownerMobile];
    smsBody = `Someone has scanned your ${env.appName} QR for ${label} and is trying to contact you.`;
  } else {
    if (qr.emergencyContacts.length === 0) {
      throw new ApiError(400, 'This QR has no emergency contacts configured');
    }
    const contact = input.contactId
      ? qr.emergencyContacts.find((c) => c.id === input.contactId)
      : qr.emergencyContacts[0];
    if (!contact) {
      throw new ApiError(404, 'Emergency contact not found for this QR');
    }
    targetMobile = contact.mobile;
    smsRecipients = qr.emergencyContacts.map((c) => c.mobile);
    smsBody = `Emergency Alert! Someone scanned the ${env.appName} QR for ${label} and is trying to contact the emergency contact.`;
  }

  // SMS must go out before the call is connected - send it now, before the browser
  // even opens the Twilio Voice SDK connection.
  await Promise.all(
    smsRecipients.map((to) =>
      twilioClient.messages.create({
        to,
        from: env.twilioMessagingFromNumber,
        body: smsBody,
      }),
    ),
  );

  const { ipAddress } = extractDeviceInfo(req);

  const callLog = await prisma.callLog.create({
    data: {
      qrId: qr.id,
      callerType: input.targetType,
      targetMobile,
      status: 'INITIATED',
      callerIp: ipAddress,
      callerRef,
    },
  });

  await logScan(qr.id, req, input.targetType === 'OWNER' ? 'CALL_OWNER' : 'CALL_EMERGENCY', {
    latitude: input.latitude,
    longitude: input.longitude,
  });

  await createNotification(
    qr.userId,
    input.targetType === 'OWNER' ? 'INCOMING_CALL' : 'EMERGENCY_CONTACT_CALLED',
    input.targetType === 'OWNER' ? 'Incoming Call Request' : 'Emergency Contact Called',
    smsBody,
    { qrId: qr.id, callLogId: callLog.id },
  );

  const voiceToken = buildVoiceAccessToken();

  return { voiceToken, callLogId: callLog.id };
}

function buildVoiceAccessToken(): string {
  const identity = `anon-${uuid()}`;
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: env.twilioTwimlAppSid,
  });

  const token = new AccessToken(env.twilioAccountSid, env.twilioApiKeySid, env.twilioApiKeySecret, { identity });
  token.addGrant(voiceGrant);
  return token.toJwt();
}

/** TwiML voice webhook - Twilio calls this the moment the browser's Voice SDK places the call. */
export async function buildVoiceTwiml(callLogId: string): Promise<string> {
  const response = new twilio.twiml.VoiceResponse();
  const callLog = await prisma.callLog.findUnique({ where: { id: callLogId } });

  if (!callLog) {
    response.say('This call could not be connected. Goodbye.');
    response.hangup();
    return response.toString();
  }

  const dial = response.dial({
    callerId: env.twilioCallerIdNumber,
    action: `/api/calls/status-webhook?callLogId=${callLog.id}`,
    method: 'POST',
  });
  dial.number(callLog.targetMobile);

  return response.toString();
}

export async function recordCallSid(callLogId: string, callSid: string): Promise<void> {
  await prisma.callLog.update({ where: { id: callLogId }, data: { twilioCallSid: callSid } });
}

const DIAL_STATUS_MAP: Record<string, 'ANSWERED' | 'MISSED' | 'BUSY' | 'REJECTED' | 'FAILED'> = {
  completed: 'ANSWERED',
  'no-answer': 'MISSED',
  busy: 'BUSY',
  canceled: 'REJECTED',
  failed: 'FAILED',
};

export async function handleStatusCallback(
  callLogId: string,
  dialCallStatus: string | undefined,
  dialCallSid: string | undefined,
  dialCallDuration: string | undefined,
): Promise<void> {
  const status = (dialCallStatus ? DIAL_STATUS_MAP[dialCallStatus] : undefined) ?? 'FAILED';

  await prisma.callLog.update({
    where: { id: callLogId },
    data: {
      status,
      twilioCallSid: dialCallSid ?? undefined,
      durationSec: dialCallDuration ? parseInt(dialCallDuration, 10) : undefined,
    },
  });
}

/** Owner-facing Call History tab, newest first. */
export async function listCallLogsForOwner(userId: string, qrId: string) {
  await assertQrOwnership(userId, qrId);
  const logs = await prisma.callLog.findMany({ where: { qrId }, orderBy: { createdAt: 'desc' } });
  return logs.map((log) => ({ ...log, targetMobile: undefined, blockIdentifier: log.callerRef }));
}
