import { Router } from 'express';
import * as authController from './auth.controller';
import { checkMobileSchema, loginSchema, registerSchema, sendOtpSchema } from './auth.validation';
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
 * /api/auth/send-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Request a login/registration OTP for a mobile number
 *     description: >
 *       Testing shim — no real SMS is sent. The valid code is always the value
 *       of the HARDCODED_OTP env var (defaults to `1234`). Wire up Twilio Verify
 *       here before shipping.
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
 *       200: { description: OTP dispatched }
 */
router.post('/send-otp', authLimiter, validateBody(sendOtpSchema), authController.sendOtp);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with an existing mobile number + OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile, otp]
 *             properties:
 *               mobile: { type: string }
 *               otp: { type: string, example: "1234" }
 *     responses:
 *       200: { description: JWT + user }
 *       401: { description: Invalid or expired OTP }
 *       404: { description: No account found }
 */
router.post('/login', authLimiter, validateBody(loginSchema), authController.login);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user with mobile + OTP + full name + email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile, fullName, email, otp]
 *             properties:
 *               mobile: { type: string }
 *               fullName: { type: string }
 *               email: { type: string }
 *               otp: { type: string, example: "1234" }
 *     responses:
 *       201: { description: JWT + newly created user }
 *       401: { description: Invalid or expired OTP }
 *       409: { description: Mobile number already registered }
 */
router.post('/register', authLimiter, validateBody(registerSchema), authController.register);

export default router;
