import { createApp } from '../src/app';

/**
 * Vercel serverless entry point. Vercel's Node runtime accepts an Express app
 * exported directly (it's just a (req, res) => void function under the hood) -
 * no app.listen() here, Vercel manages the HTTP server itself.
 *
 * Note: the Socket.IO gateway in src/config/socket.ts is only initialized by
 * src/server.ts (the traditional long-running entry point used by
 * Dockerfile/docker-compose). On Vercel, io stays null and emitToUser() is a
 * no-op (already guarded for this) - realtime push notifications don't fire
 * here; the REST /api/notifications list/read endpoints still work normally.
 */
export default createApp();
