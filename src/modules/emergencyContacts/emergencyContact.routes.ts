import { Router } from 'express';
import * as emergencyContactController from './emergencyContact.controller';
import { createEmergencyContactSchema, updateEmergencyContactSchema } from './emergencyContact.validation';
import { validateBody } from '../../common/middlewares/validate';

// mergeParams: true so :qrId from the parent /api/qr/:qrId/contacts mount is visible here
const router = Router({ mergeParams: true });

/**
 * @openapi
 * /api/qr/{qrId}/contacts:
 *   get:
 *     tags: [Emergency Contacts]
 *     summary: List emergency contacts for a QR (max 3)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: qrId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of emergency contacts }
 */
router.get('/', emergencyContactController.list);

/**
 * @openapi
 * /api/qr/{qrId}/contacts:
 *   post:
 *     tags: [Emergency Contacts]
 *     summary: Add an emergency contact (max 3 per QR)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: qrId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Created contact }
 *       400: { description: Maximum of 3 contacts reached }
 */
router.post('/', validateBody(createEmergencyContactSchema), emergencyContactController.add);

/**
 * @openapi
 * /api/qr/{qrId}/contacts/{contactId}:
 *   patch:
 *     tags: [Emergency Contacts]
 *     summary: Edit an emergency contact
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: qrId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated contact }
 *       404: { description: Not found }
 */
router.patch('/:contactId', validateBody(updateEmergencyContactSchema), emergencyContactController.update);

/**
 * @openapi
 * /api/qr/{qrId}/contacts/{contactId}:
 *   delete:
 *     tags: [Emergency Contacts]
 *     summary: Delete an emergency contact
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: qrId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.delete('/:contactId', emergencyContactController.remove);

export default router;
