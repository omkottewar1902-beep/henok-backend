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

export async function dial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { qrId, type, contactId } = req.query as Record<string, string>;
    if (!qrId || !type) {
      res.status(400).send('Missing qrId or type');
      return;
    }
    const targetType = type === 'EMERGENCY' ? 'EMERGENCY' : 'OWNER';
    const mobile = await callsService.resolveDialNumber(qrId, targetType, contactId, req);
    res.redirect(`tel:${mobile.replace(/[^\d+]/g, '')}`);
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
