import dotenv from 'dotenv';

dotenv.config();

const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  port: parseInt(process.env.PORT ?? '4000', 10),
  logLevel: (process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug')) as
    | 'debug'
    | 'info'
    | 'warn'
    | 'error',
  appName: process.env.APP_NAME ?? 'JCSafeScan',
  appBaseUrl: required('APP_BASE_URL', 'http://localhost:4000'),
  scanPublicUrl: required('SCAN_PUBLIC_URL', 'http://localhost:4000/scan'),

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',

  stripeSecretKey: required('STRIPE_SECRET_KEY', 'sk_test_placeholder'),
  stripeWebhookSecret: required('STRIPE_WEBHOOK_SECRET', 'whsec_placeholder'),
  stripeQrPriceUsd: parseFloat(process.env.STRIPE_QR_PRICE_USD ?? '5.00'),
  stripeSuccessUrl: required('STRIPE_SUCCESS_URL', 'http://localhost:4000/api/payments/success'),
  stripeCancelUrl: required('STRIPE_CANCEL_URL', 'http://localhost:4000/api/payments/cancel'),

  twilioAccountSid: required('TWILIO_ACCOUNT_SID', 'ACplaceholder'),
  twilioAuthToken: required('TWILIO_AUTH_TOKEN', 'placeholder'),
  twilioApiKeySid: required('TWILIO_API_KEY_SID', 'SKplaceholder'),
  twilioApiKeySecret: required('TWILIO_API_KEY_SECRET', 'placeholder'),
  twilioTwimlAppSid: required('TWILIO_TWIML_APP_SID', 'APplaceholder'),
  twilioCallerIdNumber: required('TWILIO_CALLER_ID_NUMBER', '+15005550006'),
  twilioMessagingFromNumber: required('TWILIO_MESSAGING_FROM_NUMBER', '+15005550006'),

  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
};
