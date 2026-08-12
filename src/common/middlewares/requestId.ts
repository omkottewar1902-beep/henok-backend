import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

/**
 * Attach a stable request id per request. Respects an incoming `x-request-id`
 * (so a load balancer or upstream service can correlate) and otherwise mints
 * a UUID. Echoed back in the response header so clients can quote it in bug
 * reports.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}
