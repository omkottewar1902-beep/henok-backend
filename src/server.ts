import http from 'http';
import { createApp } from './app';
import { env, isS3Configured, isVercel } from './config/env';
import { initSocket, closeSocket } from './config/socket';
import { logger } from './common/utils/logger';
import { prisma } from './config/db';

const app = createApp();
const httpServer = http.createServer(app);

initSocket(httpServer);

const server = httpServer.listen(env.port, () => {
  logger.info(`${env.appName} API listening`, {
    port: env.port,
    env: env.nodeEnv,
    uploads: isS3Configured ? 's3' : isVercel ? 'disabled-on-vercel' : 'local-disk',
    docs: `${env.appBaseUrl}/api/docs`,
  });
});

/**
 * Give in-flight requests a chance to finish before we tear down Prisma / the
 * HTTP listener. Railway sends SIGTERM on deploy; the container is killed 10s
 * later so we keep the drain tight.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info('shutdown signal received', { signal });
  const forceExit = setTimeout(() => {
    logger.warn('forced exit after 10s drain');
    process.exit(1);
  }, 10_000).unref();

  try {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await closeSocket();
    await prisma.$disconnect();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    logger.error('error during shutdown', { err: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { message: err.message, stack: err.stack });
  // Uncaught exceptions leave the process in an undefined state — exit and
  // let the platform restart us.
  process.exit(1);
});
