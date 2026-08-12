import { env } from '../../config/env';

/**
 * Zero-dependency leveled logger. Emits single-line JSON in production so it
 * lands cleanly in Vercel / Railway log drains, and pretty text in dev.
 *
 * We deliberately avoid pino/winston here: the extra ~10MB of deps and the
 * transport story on Vercel's serverless runtime aren't worth it for the volume
 * this API produces. If we ever need sampling / redaction / async transports,
 * swap this file — call sites use only the public API.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function shouldEmit(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[env.logLevel];
}

function format(level: Level, msg: string, meta?: Record<string, unknown>): string {
  if (env.isProd) {
    return JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  }
  const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${level.toUpperCase()}] ${msg}${metaStr}`;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (!shouldEmit(level)) return;
  const line = format(level, msg, meta);
  if (level === 'error' || level === 'warn') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
