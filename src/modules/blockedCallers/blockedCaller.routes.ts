import { Router } from 'express';
import * as blockedCallerController from './blockedCaller.controller';
import { blockCallerSchema } from './blockedCaller.validation';
import { validateBody } from '../../common/middlewares/validate';

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /api/qr/{qrId}/blocked-callers:
 *   get:
 *     tags: [Blocked Callers]
 *     summary: List callers blocked from this QR
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: qrId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of blocked callers }
 */
router.get('/', blockedCallerController.list);

/**
 * @openapi
 * /api/qr/{qrId}/blocked-callers:
 *   post:
 *     tags: [Blocked Callers]
 *     summary: Block a caller (by IP/device fingerprint) from calling through this QR
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: qrId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Blocked caller record }
 */
router.post('/', validateBody(blockCallerSchema), blockedCallerController.block);

/**
 * @openapi
 * /api/qr/{qrId}/blocked-callers/{blockedId}:
 *   delete:
 *     tags: [Blocked Callers]
 *     summary: Unblock a previously blocked caller
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: qrId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: blockedId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Unblocked }
 */
router.delete('/:blockedId', blockedCallerController.unblock);

export default router;
