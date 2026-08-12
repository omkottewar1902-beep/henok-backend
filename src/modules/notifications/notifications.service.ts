import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { emitToUser } from '../../config/socket';

/**
 * Persists a notification and pushes it in real time over Socket.IO. This is the
 * in-house replacement for Firebase push - delivery only happens while the app has
 * a live socket connection; REST list/read below covers catch-up on reconnect.
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Prisma.InputJsonValue,
) {
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, data },
  });

  emitToUser(userId, 'notification', notification);

  return notification;
}

export async function listForUser(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function markRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) {
    return null;
  }
  return prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}
