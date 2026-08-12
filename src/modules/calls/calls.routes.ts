import { Router } from 'express';
import * as callsController from './calls.controller';
import { initiateCallSchema } from './calls.validation';
import { validateBody } from '../../common/middlewares/validate';
import { requireAuth } from '../../common/middlewares/auth.middleware';
import { callLimiter } from '../../common/middlewares/rateLimiter';
import { verifyTwilioSignature } from '../../common/middlewares/twilioSignature';

const router = Router();

/**
 * @openapi
 * /api/calls/initiate:
 *   post:
 *     tags: [Calls]
 *     summary: Public call-initiate - sends the pre-call SMS alert, logs the scan action, and returns a Twilio Voice access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [qrId, targetType]
 *             properties:
 *               qrId: { type: string }
 *               targetType: { type: string, enum: [OWNER, EMERGENCY] }
 *               contactId: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       200: { description: Twilio Voice access token + callLogId for the browser to place the masked call }
 *       403: { description: Caller is blocked }
 */
router.post('/initiate', callLimiter, validateBody(initiateCallSchema), callsController.initiate);

/**
 * @openapi
 * /api/calls/voice-webhook:
 *   post:
 *     tags: [Calls]
 *     summary: Twilio Voice webhook - returns TwiML that masks-dials the resolved owner/contact number
 *     responses:
 *       200: { description: TwiML XML }
 */
router.post('/voice-webhook', verifyTwilioSignature, callsController.voiceWebhook);

/**
 * @openapi
 * /api/calls/status-webhook:
 *   post:
 *     tags: [Calls]
 *     summary: Twilio Dial status callback - records call duration/status
 *     responses:
 *       200: { description: Empty TwiML acknowledgement }
 */
router.post('/status-webhook', verifyTwilioSignature, callsController.statusWebhook);

export default router;

/** Owner-facing Call History, mounted at /api/qr/:qrId/call-logs */
export const ownerCallLogRoutes = Router({ mergeParams: true });
ownerCallLogRoutes.use(requireAuth);
ownerCallLogRoutes.get('/', callsController.listForOwner);
