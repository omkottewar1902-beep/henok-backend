import { Request, Response, NextFunction } from 'express';
import { AuthedRequest } from '../../common/middlewares/auth.middleware';
import * as callsService from './calls.service';

export async function initiate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    console.log(
      `[calls.initiate] qrId=${req.body?.qrId}  targetType=${req.body?.targetType}  contactId=${req.body?.contactId ?? 'none'}`,
    );
    const result = await callsService.initiateCall(req.body, req);
    console.log(
      `[calls.initiate] issued  callLogId=${result.callLogId}  tokenLen=${(result.voiceToken || '').length}`,
    );
    res.json(result);
  } catch (err) {
    console.error('[calls.initiate] error:', err);
    next(err);
  }
}

export async function voiceWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const callLogId = req.body.callLogId as string | undefined;
    const callSid = req.body.CallSid as string | undefined;
    console.log(
      `[twilio-voice-webhook] hit  CallSid=${callSid ?? 'none'}  callLogId=${callLogId ?? 'none'}  bodyKeys=[${Object.keys(req.body ?? {}).join(',')}]`,
    );
    if (!callLogId) {
      console.warn('[twilio-voice-webhook] no callLogId in body — returning graceful hangup TwiML');
      res
        .type('text/xml')
        .send('<Response><Say>This call could not be connected. Goodbye.</Say><Hangup/></Response>');
      return;
    }
    const twiml = await callsService.buildVoiceTwiml(callLogId);
    if (callSid) {
      await callsService.recordCallSid(callLogId, callSid);
    }
    console.log(`[twilio-voice-webhook] returning TwiML for callLogId=${callLogId}`);
    res.type('text/xml').send(twiml);
  } catch (err) {
    console.error('[twilio-voice-webhook] error:', err);
    next(err);
  }
}

export async function statusWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const callLogId = req.query.callLogId as string;
    await callsService.handleStatusCallback(
      callLogId,
      req.body.DialCallStatus as string | undefined,
      req.body.DialCallSid as string | undefined,
      req.body.DialCallDuration as string | undefined,
    );
    res.type('text/xml').send('<Response></Response>');
  } catch (err) {
    next(err);
  }
}

/**
 * Redirects the scanner's browser to a `tel:` URL that dials Twilio's proxy
 * number with the QR's extension appended as DTMF. The scanner's native
 * dialer opens showing only Twilio's number — the owner's real number is
 * never sent to the browser. Twilio picks up, receives the DTMF via
 * <Gather>, and bridges to the resolved owner/contact.
 */
export async function dial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { qrId, type, contactId } = req.query as Record<string, string>;
    if (!qrId || !type) {
      res.status(400).send('Missing qrId or type');
      return;
    }
    const targetType = type === 'EMERGENCY' ? 'EMERGENCY' : 'OWNER';
    const telUrl = await callsService.buildProxyDialUrl(qrId, targetType, contactId, req);
    res.redirect(telUrl);
  } catch (err) {
    next(err);
  }
}

/**
 * Inbound-voice webhook — Twilio hits this when a scanner dials the shared
 * Twilio number. We open a <Gather> to capture the DTMF extension (which the
 * scanner's phone auto-sends after the `,,` pause in the tel: URL) and then
 * route to the resolver endpoint.
 */
export async function incomingCall(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const from = (req.body?.From as string) ?? 'unknown';
    console.log(`[twilio-incoming] hit  From=${from}  CallSid=${req.body?.CallSid ?? 'none'}`);
    // Twilio Node helper isn't loaded here to keep this handler dependency-free;
    // hand-written TwiML is simpler and equally valid.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" action="/api/calls/incoming/route" method="POST" timeout="15" finishOnKey="">
    <Say voice="alice">Connecting your call. Please hold.</Say>
  </Gather>
  <Say voice="alice">No extension was received. Goodbye.</Say>
  <Hangup/>
</Response>`;
    res.type('text/xml').send(twiml);
  } catch (err) {
    next(err);
  }
}

/**
 * DTMF-router webhook — Twilio hits this after the <Gather> completes.
 * Body contains `Digits` (the accumulated keypad input). We parse the
 * extension + optional route digits, look up the owner/contact, and return
 * TwiML that dials them from Twilio's number.
 */
export async function incomingRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const digits = (req.body?.Digits as string) ?? '';
    console.log(`[twilio-incoming-route] Digits="${digits}"  CallSid=${req.body?.CallSid ?? 'none'}`);
    const resolved = await callsService.resolveExtensionRoute(digits);
    if (!resolved) {
      const errXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Sorry, that extension is not active. Goodbye.</Say>
  <Hangup/>
</Response>`;
      res.type('text/xml').send(errXml);
      return;
    }
    const callerId = (await import('../../config/env')).env.twilioCallerIdNumber;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you now.</Say>
  <Dial callerId="${callerId}" answerOnBridge="true" timeout="30">
    <Number>${resolved.targetMobile}</Number>
  </Dial>
</Response>`;
    console.log(`[twilio-incoming-route] bridging to ${resolved.label}`);
    res.type('text/xml').send(twiml);
  } catch (err) {
    next(err);
  }
}

export async function listForOwner(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const logs = await callsService.listCallLogsForOwner(req.userId!, req.params.qrId);
    res.json(logs);
  } catch (err) {
    next(err);
  }
}
