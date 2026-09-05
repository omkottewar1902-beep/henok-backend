-- Add User.stripeCustomerId (unique) so we can cache the Stripe Customer per user.
ALTER TABLE "users" ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- Make Payment.stripePaymentIntent unique so duplicate webhook deliveries can
-- never insert the same PI twice.
CREATE UNIQUE INDEX "payments_stripePaymentIntent_key" ON "payments"("stripePaymentIntent");
