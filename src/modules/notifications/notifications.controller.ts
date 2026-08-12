import { Response, NextFunction } from 'express';
import { AuthedRequest } from '../../common/middlewares/auth.middleware';
import * as notificationsService from './notifications.service';

export async function list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const notifications = await notificationsService.listForUser(req.userId!);
    res.json(notifications);
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const notification = await notificationsService.markRead(req.userId!, req.params.id);
    if (!notification) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }
    res.json(notification);
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await notificationsService.markAllRead(req.userId!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
