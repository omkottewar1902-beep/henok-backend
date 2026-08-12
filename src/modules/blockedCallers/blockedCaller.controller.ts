import { Response, NextFunction } from 'express';
import { AuthedRequest } from '../../common/middlewares/auth.middleware';
import * as blockedCallerService from './blockedCaller.service';

export async function list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const blocked = await blockedCallerService.list(req.userId!, req.params.qrId);
    res.json(blocked);
  } catch (err) {
    next(err);
  }
}

export async function block(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await blockedCallerService.block(req.userId!, req.params.qrId, req.body.identifier, req.body.reason);
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
}

export async function unblock(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await blockedCallerService.unblock(req.userId!, req.params.qrId, req.params.blockedId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
