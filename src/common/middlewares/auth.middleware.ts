import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.util';

export interface AuthedRequest extends Request {
  userId?: string;
  mobile?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.mobile = payload.mobile;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
