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

  // Wording matches the sample messages registered in the Twilio A2P 10DLC
  // campaign for "Jcscan2connect" (Sole Prop). Carriers spot-audit real
  // traffic against registered samples — if the body drifts away from
  // "Jcscan2connect notification:" / "The QR sticker ... was scanned",
  // the campaign can be paused.
  if (input.targetType === 'OWNER') {
    targetMobile = qr.ownerMobile;
    smsRecipients = [qr.ownerMobile];
    smsBody = `Jcscan2connect: The QR sticker registered to ${label} was scanned. The person who scanned it may be trying to reach you. Reply STOP to opt out, HELP for help.`;
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
    smsBody = `Jcscan2connect: The QR sticker registered to ${label} was scanned. The person who scanned it may be trying to reach the owner, and you are listed as a contact. Reply STOP to opt out, HELP for help.`;
  }

  // SMS must go out before the call is connected - send it now, before the browser
  // even opens the Twilio Voice SDK connection.
  // Prefer sending via the A2P-registered Messaging Service (Sender Pool +
  // STOP/HELP handling from the campaign). Falls back to the raw From number
  // if the MG SID isn't configured (e.g. local dev).
  const smsSender = env.twilioMessagingServiceSid
    ? { messagingServiceSid: env.twilioMessagingServiceSid }
    : { from: env.twilioMessagingFromNumber };
  await Promise.all(
    smsRecipients.map((to) =>
      twilioClient.messages.create({
        to,
        body: smsBody,
        ...smsSender,
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

  // Log the shape of what we're about to hand the browser so 53000 signaling
  // failures can be traced to bad SID / API-Key mismatch / stale TwiML App.
  console.log(
    `[voice-token] identity=${identity}  accountSid=${env.twilioAccountSid.slice(0, 6)}…${env.twilioAccountSid.slice(-4)}  apiKey=${env.twilioApiKeySid.slice(0, 6)}…  twimlApp=${env.twilioTwimlAppSid.slice(0, 6)}…`,
  );

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

/**
 * Looks up the real phone number for an owner or emergency contact and returns it
 * so the controller can redirect the browser to `tel:<number>`. The real number
 * is never sent to the scan-page JavaScript — it only travels as an HTTP redirect.
 * Also logs the call action so the owner can see it in their scan/call history.
 */
export async function resolveDialNumber(
  qrId: string,
  targetType: 'OWNER' | 'EMERGENCY',
  contactId: string | undefined,
  req: Request,
): Promise<string> {
  const qr = await prisma.qr.findUnique({
    where: { id: qrId },
    include: { emergencyContacts: true },
  });

  if (!qr || qr.status !== 'ACTIVE') {
    throw new ApiError(404, 'This QR code is not active');
  }

  let targetMobile: string;

  if (targetType === 'OWNER') {
    targetMobile = qr.ownerMobile;
  } else {
    const contact = contactId
      ? qr.emergencyContacts.find((c) => c.id === contactId)
      : qr.emergencyContacts[0];
    if (!contact) throw new ApiError(404, 'Emergency contact not found');
    targetMobile = contact.mobile;
  }

  // Log so the owner can see who called
  await logScan(qr.id, req, targetType === 'OWNER' ? 'CALL_OWNER' : 'CALL_EMERGENCY').catch(() => {});

  return targetMobile;
}

/**
 * Twilio-proxy dial URL. Instead of exposing the owner's real phone number
 * to the scanner's dialer, return a `tel:` URL to the shared Twilio number
 * with the QR's 5-digit extension appended as DTMF (after a short pause
 * so Twilio's <Gather> has time to answer and start listening).
 *
 * When the scanner dials this on their phone, Twilio picks up, receives the
 * extension via DTMF, looks up the owner in the DB, and bridges the call —
 * both parties only ever see the Twilio number.
 */
export async function buildProxyDialUrl(
  qrId: string,
  targetType: 'OWNER' | 'EMERGENCY',
  contactId: string | undefined,
  req: Request,
): Promise<string> {
  const qr = await prisma.qr.findUnique({
    where: { id: qrId },
    include: { emergencyContacts: true },
  });
  if (!qr || qr.status !== 'ACTIVE') {
    throw new ApiError(404, 'This QR code is not active');
  }

  // Log the scan action + fire the SMS alert to emergency contacts NOW
  // (before the scanner completes the call). This matches what /initiate
  // did in the Voice-SDK flow.
  await logScan(qr.id, req, targetType === 'OWNER' ? 'CALL_OWNER' : 'CALL_EMERGENCY').catch(() => {});

  // Build the DTMF payload. Pattern: <extension>#<0=owner|1=emergency>[<contactIndex>]#
  //   10005#0#     → route to owner of extension 10005
  //   10005#1#     → route to first emergency contact of 10005
  //   10005#1#2#   → route to 2nd (0-indexed) emergency contact of 10005
  // The `#` terminates each Gather so the router webhook fires quickly.
  const extension = qr.extensionNumber;
  let dtmf = `${extension}#`;
  if (targetType === 'EMERGENCY') {
    const idx = contactId ? qr.emergencyContacts.findIndex((c) => c.id === contactId) : 0;
    dtmf = `${extension}#1${idx >= 0 ? idx : 0}#`;
  } else {
    dtmf = `${extension}#0#`;
  }

  // `,,` = 4-second pause on iOS/Android before DTMF is sent — long enough for
  // Twilio to answer and begin the first <Gather>.
  const twilioNumber = env.twilioCallerIdNumber.replace(/[^\d+]/g, '');
  return `tel:${twilioNumber},,${dtmf}`;
}

/**
 * Called from the inbound-voice DTMF router webhook. Given the extension +
 * routing digits sent by the scanner's phone, returns TwiML that bridges the
 * call to the correct owner or emergency contact.
 *
 * Returns an object the controller can turn into TwiML, or throws if the
 * extension isn't found (controller will hangup gracefully).
 */
export async function resolveExtensionRoute(
  digits: string,
): Promise<{ targetMobile: string; label: string } | null> {
  // Router receives the full accumulated Digits string, minus trailing #s.
  // Example inputs (after Twilio strips trailing #):
  //   "10005"         → owner of ext 10005 (no route digit; default owner)
  //   "10005#0"       → owner
  //   "10005#1"       → first emergency contact
  //   "10005#1#2"     → 3rd emergency contact
  //
  // We tolerate the # or no # for maximum device compatibility.
  const clean = digits.replace(/\s+/g, '');
  const parts = clean.split('#').filter(Boolean);
  const extension = parts[0];
  const routeDigit = parts[1] ?? '0';
  const contactIndexStr = parts[2] ?? '0';

  if (!/^\d{5}$/.test(extension)) return null;

  const qr = await prisma.qr.findUnique({
    where: { extensionNumber: extension },
    include: { emergencyContacts: true, vehicle: true, dog: true, luggage: true, otherItem: true },
  });
  if (!qr || qr.status !== 'ACTIVE') return null;

  if (routeDigit === '1') {
    const idx = parseInt(contactIndexStr, 10);
    const contact = qr.emergencyContacts[isNaN(idx) ? 0 : idx];
    if (!contact) return null;
    return { targetMobile: contact.mobile, label: `${contact.name} (${contact.relationship})` };
  }
  // Default: OWNER
  return { targetMobile: qr.ownerMobile, label: qr.ownerName };
}

/** Owner-facing Call History tab, newest first. */
export async function listCallLogsForOwner(userId: string, qrId: string) {
  await assertQrOwnership(userId, qrId);
  const logs = await prisma.callLog.findMany({ where: { qrId }, orderBy: { createdAt: 'desc' } });
  return logs.map((log) => ({ ...log, targetMobile: undefined, blockIdentifier: log.callerRef }));
}
