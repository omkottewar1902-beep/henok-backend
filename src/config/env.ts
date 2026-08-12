import dotenv from 'dotenv';

dotenv.config();

const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

/**
 * These placeholder values ship as dev defaults so `npm run dev` works with no
 * config. If any of them survive into a production boot, we refuse to start —
 * running with a well-known JWT secret or Stripe test key in prod is a security
 * incident waiting to happen.
 */
const PLACEHOLDER_VALUES = new Set([
  'dev-secret-change-me',
  'sk_test_placeholder',
  'whsec_placeholder',
  'ACplaceholder',
  'SKplaceholder',
  'APplaceholder',
  'placeholder',
]);

function required(name: string, fallback?: string): string {
  const raw = process.env[name];
  const value = raw ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (isProd && (raw === undefined || PLACEHOLDER_VALUES.has(raw))) {
    throw new Error(
      `Refusing to start: env var ${name} is unset or still using a dev placeholder in production.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const corsOrigins = parseOrigins(process.env.CORS_ORIGINS);

if (isProd && corsOrigins.length === 0) {
  throw new Error(
    'Refusing to start: CORS_ORIGINS must be set to an explicit allowlist in production (comma-separated).',
  );
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  port: parseInt(process.env.PORT ?? '4000', 10),
  appName: process.env.APP_NAME ?? 'JCSafeScan',
  appBaseUrl: required('APP_BASE_URL', 'http://localhost:4000'),
  scanPublicUrl: required('SCAN_PUBLIC_URL', 'http://localhost:4000/scan'),

  /**
   * Empty in dev = "reflect the request Origin" (permissive). In prod we
   * enforce a non-empty allowlist above, so this is always a concrete list here.
   */
  corsOrigins,

  logLevel: (process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug')) as
    | 'debug'
    | 'info'
    | 'warn'
    | 'error',

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

  /**
   * Express `trust proxy` setting. Set to the number of reverse-proxy hops in
   * front of the app (Render / Fly / Railway / Heroku = 1). Required so
   * `req.ip` and express-rate-limit see the real client IP from
   * `X-Forwarded-For` instead of the proxy address. Independent of NODE_ENV so
   * you can deploy without flipping every other prod-only check on at once.
   */
  trustProxy: (() => {
    const raw = process.env.TRUST_PROXY;
    if (raw === undefined || raw === '') return isProd ? 1 : false;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : raw;
  })(),

  /**
   * S3-compatible object storage for user-uploaded images (Dog/Luggage photos).
   * When `s3.bucket` is set, uploads go to S3 — required on Vercel where the
   * local filesystem is read-only. When unset, uploads fall back to local disk
   * under `public/uploads` (fine on Railway / Docker / bare metal).
   */
  s3: {
    bucket: optional('S3_BUCKET'),
    region: optional('S3_REGION'),
    accessKeyId: optional('S3_ACCESS_KEY_ID'),
    secretAccessKey: optional('S3_SECRET_ACCESS_KEY'),
    /** Custom endpoint for non-AWS S3 (R2, MinIO, Spaces, Supabase Storage). */
    endpoint: optional('S3_ENDPOINT'),
    /** Public base URL for reads. Falls back to `https://{bucket}.s3.{region}.amazonaws.com`. */
    publicBaseUrl: optional('S3_PUBLIC_BASE_URL'),
    /** Force path-style URLs (needed for MinIO / some non-AWS providers). */
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
};

export const isS3Configured = Boolean(
  env.s3.bucket && env.s3.region && env.s3.accessKeyId && env.s3.secretAccessKey,
);

/**
 * Vercel's filesystem is read-only outside /tmp, and /tmp is per-invocation.
 * If we're running on Vercel and S3 isn't configured, image uploads cannot work.
 */
export const isVercel = Boolean(process.env.VERCEL);
