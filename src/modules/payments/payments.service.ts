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
 * Returns the Stripe Customer id for the user, creating one on first use so
 * every subsequent checkout reuses the same customer. Reusing a customer
 * makes the Stripe Dashboard readable and unlocks future flows (saved cards,
 * subscriptions, Customer Portal).
 */
async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create(
    {
      name: user.fullName,
      email: user.email,
      phone: user.mobile,
      metadata: { userId: user.id },
    },
    // Idempotent on user id so concurrent double-clicks can't create two
    // customers for the same user.
    { idempotencyKey: `customer:${user.id}` },
  );

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Creates (or reuses) a Stripe Checkout Session for a pending-payment QR draft.
 * The QR itself is only activated once the webhook (or the sync-session
 * fallback) confirms payment succeeded.
 */
export async function createCheckoutSession(
  userId: string,
  qrId: string,
): Promise<{ url: string; sessionId: string }> {
  const qr = await assertQrOwnership(userId, qrId);

  if (qr.status !== 'PENDING_PAYMENT') {
    throw new ApiError(400, 'This QR has already been paid for');
  }

  const amountInCents = Math.round(env.stripeQrPriceUsd * 100);
  const customerId = await getOrCreateStripeCustomer(userId);

  // Reuse the existing PENDING payment row for this QR (if any) rather than
  // stacking a new row on every "Pay" click.
  const existing = await prisma.payment.findFirst({
    where: { qrId, userId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  const payment =
    existing ??
    (await prisma.payment.create({
      data: {
        userId,
        qrId,
        amount: env.stripeQrPriceUsd,
        currency: 'usd',
        status: 'PENDING',
      },
    }));

  const metadata = { paymentId: payment.id, qrId, userId };

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      customer: customerId,
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
      client_reference_id: userId,
      metadata,
      // Duplicate the metadata onto the PaymentIntent so PI-only webhooks
      // (payment_intent.payment_failed, payment_intent.succeeded) can still
      // route by paymentId without needing to look up the Session.
      payment_intent_data: {
        metadata,
        receipt_email: qr.ownerEmail || undefined,
      },
    },
    // Idempotency key so a double-click / retry doesn't create two sessions.
    // Includes updatedAt so retrying after a session actually expires still
    // works (Stripe returns 200 for the same key within 24h).
    { idempotencyKey: `checkout:${payment.id}` },
  );

  await prisma.payment.update({
    where: { id: payment.id },
    data: { stripeSessionId: session.id },
  });

  if (!session.url) {
    throw new ApiError(502, 'Stripe did not return a checkout URL');
  }

  return { url: session.url, sessionId: session.id };
}

/**
 * Verifies + dispatches an incoming Stripe webhook. Always resolves quickly;
 * unknown event types return without throwing so Stripe doesn't retry.
 */
export async function handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  } catch (err) {
    // Bad signature = 400, no retry.
    throw new ApiError(400, `Webhook signature verification failed: ${(err as Error).message}`);
  }

  // Structured log for prod observability.
  console.log(`[stripe] event=${event.type} id=${event.id}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await fulfillCheckoutSession(session);
      break;
    }
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      await fulfillCheckoutSession(session);
      break;
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await markPaymentFailedFromSession(session);
      break;
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      await markPaymentFailedFromIntent(intent);
      break;
    }
    default:
      // Unknown / unhandled event — no-op. Return 200 so Stripe doesn't retry.
      break;
  }
}

/**
 * Idempotently activates the QR + marks payment SUCCEEDED for a completed
 * Checkout Session. Safe to call from BOTH the webhook and the sync-session
 * endpoint — the first caller wins via an atomic PENDING → SUCCEEDED guard.
 *
 * Returns the updated payment so callers can surface state to the client.
 */
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<{ paymentId: string; qrId: string; alreadyFulfilled: boolean }> {
  const paymentId = session.metadata?.paymentId;
  const qrId = session.metadata?.qrId;
  const userId = session.metadata?.userId;
  if (!paymentId || !qrId || !userId) {
    // Not one of our sessions (or metadata got stripped) — drop it silently.
    return { paymentId: '', qrId: '', alreadyFulfilled: true };
  }

  // Stripe considers a session "paid" only when payment_status === 'paid'.
  // async_payment_succeeded lands here too and satisfies this check.
  if (session.payment_status !== 'paid') {
    return { paymentId, qrId, alreadyFulfilled: true };
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Atomic PENDING → SUCCEEDED. If another concurrent webhook / sync call
  // beat us to it, `count` is 0 and we skip the rest of the fulfillment.
  const result = await prisma.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: {
      status: 'SUCCEEDED',
      stripePaymentIntent: paymentIntentId,
    },
  });

  if (result.count === 0) {
    return { paymentId, qrId, alreadyFulfilled: true };
  }

  // Flip the QR to ACTIVE. Guard on status so a manually-disabled QR isn't
  // silently re-enabled by a delayed webhook.
  await prisma.qr.updateMany({
    where: { id: qrId, status: 'PENDING_PAYMENT' },
    data: { status: 'ACTIVE' },
  });

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

  return { paymentId, qrId, alreadyFulfilled: false };
}

/**
 * Called from the frontend after Stripe redirects back to the success URL.
 * Guards against slow webhooks by fetching the session fresh from Stripe
 * and running the same idempotent fulfillment. The caller must own the QR
 * that the session was created for.
 */
export async function syncSession(
  userId: string,
  sessionId: string,
): Promise<{ status: 'paid' | 'pending' | 'failed'; qrId: string | null }> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  // Cross-check ownership: the session's client_reference_id must be the
  // authenticated user. Prevents a malicious user from probing arbitrary
  // session ids to fulfill someone else's QR.
  if (session.client_reference_id !== userId) {
    throw new ApiError(403, 'You cannot sync a checkout session that does not belong to you');
  }

  const qrId = session.metadata?.qrId ?? null;

  if (session.payment_status === 'paid') {
    await fulfillCheckoutSession(session);
    return { status: 'paid', qrId };
  }
  if (session.status === 'expired') {
    await markPaymentFailedFromSession(session);
    return { status: 'failed', qrId };
  }
  return { status: 'pending', qrId };
}

async function markPaymentFailedFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return;
  await prisma.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
}

async function markPaymentFailedFromIntent(intent: Stripe.PaymentIntent): Promise<void> {
  const paymentId = intent.metadata?.paymentId;
  if (paymentId) {
    await prisma.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: 'FAILED', stripePaymentIntent: intent.id },
    });
    return;
  }
  // Metadata missing (shouldn't happen with the new create-session flow, but
  // fall back to matching by stripePaymentIntent for legacy rows).
  await prisma.payment.updateMany({
    where: { stripePaymentIntent: intent.id, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
}
