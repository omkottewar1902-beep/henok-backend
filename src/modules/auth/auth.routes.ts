import { Router } from 'express';
import * as authController from './auth.controller';
import { checkMobileSchema, loginSchema, registerSchema } from './auth.validation';
import { validateBody } from '../../common/middlewares/validate';
import { authLimiter } from '../../common/middlewares/rateLimiter';

const router = Router();

/**
 * @openapi
 * /api/auth/check-mobile:
 *   post:
 *     tags: [Auth]
 *     summary: Check whether a USA mobile number already has an account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile]
 *             properties:
 *               mobile: { type: string, example: "+14155552671" }
 *     responses:
 *       200:
 *         description: Whether the account exists
 */
router.post('/check-mobile', authLimiter, validateBody(checkMobileSchema), authController.checkMobile);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with an existing mobile number (no password)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile]
 *             properties:
 *               mobile: { type: string }
 *     responses:
 *       200: { description: JWT + user }
 *       404: { description: No account found }
 */
router.post('/login', authLimiter, validateBody(loginSchema), authController.login);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user with mobile + full name + email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile, fullName, email]
 *             properties:
 *               mobile: { type: string }
 *               fullName: { type: string }
 *               email: { type: string }
 *     responses:
 *       201: { description: JWT + newly created user }
 *       409: { description: Mobile number already registered }
 */
router.post('/register', authLimiter, validateBody(registerSchema), authController.register);

export default router;
