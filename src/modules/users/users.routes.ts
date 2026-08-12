import { Router } from 'express';
import * as usersController from './users.controller';
import { updateMeSchema } from './users.validation';
import { validateBody } from '../../common/middlewares/validate';
import { requireAuth } from '../../common/middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get the current user's profile
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User profile }
 */
router.get('/me', usersController.getMe);

/**
 * @openapi
 * /api/users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update the current user's profile (fullName/email only - mobile is immutable)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Updated user profile }
 */
router.patch('/me', validateBody(updateMeSchema), usersController.updateMe);

export default router;
