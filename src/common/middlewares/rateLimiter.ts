import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';

export const defaultLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again shortly.' },
});

export const scanLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many scan requests, please try again shortly.' },
});

export const callLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many call attempts, please try again shortly.' },
});
