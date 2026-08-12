import { Response, NextFunction } from 'express';
import { AuthedRequest } from '../../common/middlewares/auth.middleware';
import * as usersService from './users.service';

export async function getMe(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersService.getMe(req.userId!);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersService.updateMe(req.userId!, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
}
