import { Router } from 'express';
import * as qrController from './qr.controller';
import { createQrDraftSchema, updateQrInfoSchema } from './qr.validation';
import { validateBody } from '../../common/middlewares/validate';
import { requireAuth } from '../../common/middlewares/auth.middleware';
import emergencyContactRoutes from '../emergencyContacts/emergencyContact.routes';
import blockedCallerRoutes from '../blockedCallers/blockedCaller.routes';
import { ownerScanLogRoutes } from '../scan/scan.routes';
import { ownerCallLogRoutes } from '../calls/calls.routes';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/qr/draft:
 *   post:
 *     tags: [QR]
 *     summary: Create a QR draft (Car/Dog/Luggage/Other) pending payment
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Draft QR created with status PENDING_PAYMENT }
 */
router.post('/draft', validateBody(createQrDraftSchema), qrController.createDraft);

/**
 * @openapi
 * /api/qr:
 *   get:
 *     tags: [QR]
 *     summary: List all QR codes owned by the current user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of QR codes }
 */
router.get('/', qrController.list);

/**
 * @openapi
 * /api/qr/{id}:
 *   get:
 *     tags: [QR]
 *     summary: Get a single QR code by id
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: QR details }
 *       404: { description: Not found }
 */
router.get('/:id', qrController.getOne);

/**
 * @openapi
 * /api/qr/{id}:
 *   patch:
 *     tags: [QR]
 *     summary: Edit QR information (owner details, address, type-specific fields)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated QR }
 */
router.patch('/:id', validateBody(updateQrInfoSchema), qrController.updateInfo);

/**
 * @openapi
 * /api/qr/{id}/disable:
 *   post:
 *     tags: [QR]
 *     summary: Disable a QR code (deactivates public scan/call access)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Disabled QR }
 */
router.post('/:id/disable', qrController.disable);

/**
 * @openapi
 * /api/qr/{id}/enable:
 *   post:
 *     tags: [QR]
 *     summary: Re-enable a previously disabled (paid) QR code
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Enabled QR }
 */
router.post('/:id/enable', qrController.enable);

/**
 * @openapi
 * /api/qr/{id}/download/png:
 *   get:
 *     tags: [QR]
 *     summary: Download the printable QR as PNG
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: PNG image }
 */
router.get('/:id/download/png', qrController.downloadPng);

/**
 * @openapi
 * /api/qr/{id}/download/pdf:
 *   get:
 *     tags: [QR]
 *     summary: Download the premium printable QR card as PDF
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: PDF file }
 */
router.get('/:id/download/pdf', qrController.downloadPdf);

router.use('/:qrId/contacts', emergencyContactRoutes);
router.use('/:qrId/blocked-callers', blockedCallerRoutes);
router.use('/:qrId/scan-logs', ownerScanLogRoutes);
router.use('/:qrId/call-logs', ownerCallLogRoutes);

export default router;
