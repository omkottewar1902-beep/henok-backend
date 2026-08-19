import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library';

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: `We couldn't find what you were looking for.` });
}

function isPrismaError(err: unknown): boolean {
  return (
    err instanceof PrismaClientKnownRequestError ||
    err instanceof PrismaClientUnknownRequestError ||
    err instanceof PrismaClientInitializationError ||
    err instanceof PrismaClientRustPanicError ||
    err instanceof PrismaClientValidationError
  );
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ message: 'Please check the details you entered and try again.' });
    return;
  }

  console.error('[error]', {
    method: req.method,
    url: req.originalUrl,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });

  if (isPrismaError(err)) {
    res.status(503).json({
      message: 'We had a hiccup reaching our servers. Please try again in a moment.',
    });
    return;
  }

  res.status(500).json({ message: 'Something went wrong on our end. Please try again shortly.' });
}
