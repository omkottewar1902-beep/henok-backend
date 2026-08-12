import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { env } from '../../config/env';

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    requestId: req.id,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ message: err.message, requestId: req.id });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Validation failed',
      errors: err.flatten(),
      requestId: req.id,
    });
    return;
  }

  // Multer surfaces upload errors (file too large, wrong field name) as errors
  // whose name starts with "Multer"; map them to 400 with a clear message.
  if (err instanceof Error && err.name === 'MulterError') {
    res.status(400).json({ message: err.message, requestId: req.id });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error('unhandled error', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    message,
    stack,
  });

  // Never leak stack traces or raw messages to clients in production.
  const clientMessage = env.isProd ? 'Internal server error' : message;
  res.status(500).json({ message: clientMessage, requestId: req.id });
}
