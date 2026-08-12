import { Response, NextFunction } from 'express';
import { AuthedRequest } from '../../common/middlewares/auth.middleware';
import { ApiError } from '../../common/middlewares/error.middleware';
import { generateQrPngBuffer } from '../../common/utils/qrCode.util';
import * as qrService from './qr.service';
import { buildQrPdfBuffer } from './qr.export';

export async function createDraft(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const qr = await qrService.createDraft(req.userId!, req.body);
    res.status(201).json(qr);
  } catch (err) {
    next(err);
  }
}

export async function list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const qrs = await qrService.listByUser(req.userId!);
    res.json(qrs);
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const qr = await qrService.getById(req.userId!, req.params.id);
    res.json(qr);
  } catch (err) {
    next(err);
  }
}

export async function updateInfo(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const qr = await qrService.updateInfo(req.userId!, req.params.id, req.body);
    res.json(qr);
  } catch (err) {
    next(err);
  }
}

export async function disable(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const qr = await qrService.disable(req.userId!, req.params.id);
    res.json(qr);
  } catch (err) {
    next(err);
  }
}

export async function enable(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const qr = await qrService.enable(req.userId!, req.params.id);
    res.json(qr);
  } catch (err) {
    next(err);
  }
}

export async function downloadPng(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const qr = await qrService.getById(req.userId!, req.params.id);
    if (!qr || qr.status !== 'ACTIVE') {
      throw new ApiError(400, 'This QR is not active yet - complete payment first');
    }
    const buffer = await generateQrPngBuffer(qr.uniqueCode);
    res.type('png').send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function downloadPdf(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const qr = await qrService.getById(req.userId!, req.params.id);
    if (!qr || qr.status !== 'ACTIVE') {
      throw new ApiError(400, 'This QR is not active yet - complete payment first');
    }
    const buffer = await buildQrPdfBuffer(qr);
    res.type('pdf').send(buffer);
  } catch (err) {
    next(err);
  }
}
