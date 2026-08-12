import { Request, Response, NextFunction } from 'express';
import { AuthedRequest } from '../../common/middlewares/auth.middleware';
import * as callsService from './calls.service';

export async function initiate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await callsService.initiateCall(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function voiceWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const callLogId = req.body.callLogId as string;
    const twiml = await callsService.buildVoiceTwiml(callLogId);
    if (req.body.CallSid) {
      await callsService.recordCallSid(callLogId, req.body.CallSid as string);
    }
    res.type('text/xml').send(twiml);
  } catch (err) {
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

export async function listForOwner(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const logs = await callsService.listCallLogsForOwner(req.userId!, req.params.qrId);
    res.json(logs);
  } catch (err) {
    next(err);
  }
}
