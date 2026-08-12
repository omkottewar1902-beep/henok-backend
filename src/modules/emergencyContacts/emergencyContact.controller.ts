import { Response, NextFunction } from 'express';
import { AuthedRequest } from '../../common/middlewares/auth.middleware';
import * as emergencyContactService from './emergencyContact.service';

export async function list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contacts = await emergencyContactService.list(req.userId!, req.params.qrId);
    res.json(contacts);
  } catch (err) {
    next(err);
  }
}

export async function add(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await emergencyContactService.add(req.userId!, req.params.qrId, req.body);
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
}

export async function update(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await emergencyContactService.update(req.userId!, req.params.qrId, req.params.contactId, req.body);
    res.json(contact);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await emergencyContactService.remove(req.userId!, req.params.qrId, req.params.contactId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
