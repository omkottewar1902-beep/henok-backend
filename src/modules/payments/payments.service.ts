import Stripe from 'stripe';
import { prisma } from '../../config/db';
import { stripe } from '../../config/stripe';
import { env } from '../../config/env';
import { ApiError } from '../../common/middlewares/error.middleware';
import { assertQrOwnership, displayLabel } from '../qr/qr.service';
import { createNotification } from '../notifications/notifications.service';

/** Payment History - the current user's payments, newest first. */
export async function listForUser(userId: string) {
  return prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { qr: { select: { type: true, uniqueCode: true } } },
  });
}

/**
 * Creates (or reuses) a $5 Stripe Checkout Session for a pending-payment QR draft.
 * The QR itself is only activated once the webhook confirms payment succeeded.
 */
export async function createCheckoutSession(userId: string, qrId: string): Promise<{ url: string }> {
  const qr = await assertQrOwnership(userId, qrId);

  if (qr.status !== 'PENDING_PAYMENT') {
    throw new ApiError(400, 'This QR has already been paid for');
  }

  const amountInCents = Math.round(env.stripeQrPriceUsd * 100);

  const payment = await prisma.payment.create({
    data: {
      userId,
      qrId,
      amount: env.stripeQrPriceUsd,
      currency: 'usd',
      status: 'PENDING',
    },
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `${env.appName} Emergency QR (${qr.type})` },
          unit_amount: amountInCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${env.stripeSuccessUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.stripeCancelUrl}?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { paymentId: payment.id, qrId, userId },
  });

  await prisma.payment.update({ where: { id: payment.id }, data: { stripeSessionId: session.id } });

  if (!session.url) {
    throw new ApiError(502, 'Stripe did not return a checkout URL');
  }

  return { url: session.url };
}

export async function handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  } catch (err) {
    throw new ApiError(400, `Webhook signature verification failed: ${(err as Error).message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await onCheckoutCompleted(session);
      break;
    }
    case 'checkout.session.expired':
    case 'payment_intent.payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await onPaymentFailed(session);
      break;
    }
    default:
      break;
  }
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const paymentId = session.metadata?.paymentId;
  const qrId = session.metadata?.qrId;
  const userId = session.metadata?.userId;
  if (!paymentId || !qrId || !userId) return;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status === 'SUCCEEDED') return; // idempotent on webhook retries

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'SUCCEEDED',
        stripePaymentIntent:
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
      },
    }),
    prisma.qr.update({ where: { id: qrId }, data: { status: 'ACTIVE' } }),
  ]);

  const qr = await prisma.qr.findUnique({
    where: { id: qrId },
    include: { vehicle: true, dog: true, luggage: true, otherItem: true },
  });

  await createNotification(
    userId,
    'PAYMENT_SUCCESS',
    'Payment Successful',
    `Your $${env.stripeQrPriceUsd.toFixed(2)} payment succeeded and your ${qr ? displayLabel(qr) : ''} QR is now active.`,
    { qrId, paymentId },
  );
}

async function onPaymentFailed(session: Stripe.Checkout.Session): Promise<void> {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return;

  await prisma.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
}
