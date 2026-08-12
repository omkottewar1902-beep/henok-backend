import { Router } from 'express';
import * as scanController from './scan.controller';
import { scanLimiter } from '../../common/middlewares/rateLimiter';
import { requireAuth } from '../../common/middlewares/auth.middleware';

const router = Router();

/**
 * @openapi
 * /api/scan/{code}:
 *   get:
 *     tags: [Scan]
 *     summary: Public masked lookup for a scanned QR code (no auth). Logs a VIEWED scan event.
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: lat
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         schema: { type: number }
 *     responses:
 *       200: { description: Masked owner/emergency-contact data + QR label }
 *       404: { description: QR not found or not active }
 */
router.get('/:code', scanLimiter, scanController.getData);

export default router;

/**
 * @openapi
 * /api/qr/{qrId}/scan-logs:
 *   get:
 *     tags: [Scan]
 *     summary: Scan History for a QR (owner only) - date, location, browser, device, action taken
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: qrId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of scan log entries }
 */
export const ownerScanLogRoutes = Router({ mergeParams: true });
ownerScanLogRoutes.use(requireAuth);
ownerScanLogRoutes.get('/', scanController.listForOwner);
