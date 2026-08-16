import { Router } from 'express';
import { requireAuth } from '../../common/middlewares/auth.middleware';
import { uploadImageMiddleware, uploadImage, rejectOnServerlessFs } from './uploads.controller';

const router = Router();

/**
 * @openapi
 * /api/uploads:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload a single image (JPEG/PNG/WEBP, max 5MB) and get back its public URL
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       201: { description: Public URL of the uploaded image }
 *       400: { description: Invalid or missing file }
 */
router.post('/', requireAuth, rejectOnServerlessFs, uploadImageMiddleware, uploadImage);

export default router;
