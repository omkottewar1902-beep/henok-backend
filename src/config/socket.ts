import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './env';

let io: SocketIOServer | null = null;

interface AuthedSocket extends Socket {
  userId?: string;
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      // Dev: reflect any origin. Prod: env-validated allowlist.
      origin: env.isProd ? env.corsOrigins : true,
      credentials: true,
    },
  });

  io.use((socket: AuthedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    try {
      const payload = jwt.verify(token, env.jwtSecret) as { userId: string };
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function closeSocket(): Promise<void> {
  return new Promise((resolve) => {
    if (!io) return resolve();
    io.close(() => resolve());
    io = null;
  });
}
