import { Request, Response, NextFunction } from 'express';
import { AuthedRequest } from '../../common/middlewares/auth.middleware';
import * as scanService from './scan.service';

export async function getData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await scanService.getPublicQrData(req.params.code);

    const latitude = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const longitude = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    await scanService.logScan(data.qrId, req, 'VIEWED', { latitude, longitude });

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function listForOwner(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const logs = await scanService.listScanLogsForOwner(req.userId!, req.params.qrId);
    res.json(logs);
  } catch (err) {
    next(err);
  }
}
