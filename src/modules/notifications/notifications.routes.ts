import { Router } from 'express';
import * as notificationsController from './notifications.controller';
import { requireAuth } from '../../common/middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List the current user's notifications (most recent first)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of notifications }
 */
router.get('/', notificationsController.list);

/**
 * @openapi
 * /api/notifications/read-all:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Marked as read }
 */
router.post('/read-all', notificationsController.markAllRead);

/**
 * @openapi
 * /api/notifications/{id}/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark a single notification as read
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated notification }
 *       404: { description: Not found }
 */
router.post('/:id/read', notificationsController.markRead);

export default router;
