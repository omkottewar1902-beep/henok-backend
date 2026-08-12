import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';

export async function checkMobile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const exists = await authService.mobileExists(req.body.mobile);
    res.json({ exists });
  } catch (err) {
    next(err);
  }
}

export async function sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.sendOtp(req.body.mobile);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body.mobile, req.body.otp);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
