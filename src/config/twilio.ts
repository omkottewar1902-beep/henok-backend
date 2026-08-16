import twilio from 'twilio';
import { env } from './env';

export const twilioClient = twilio(env.twilioAccountSid, env.twilioAuthToken);

/**
 * True once real Twilio credentials are supplied. While the dev placeholders are
 * still in place (see .env.example) every Twilio call would fail deep inside the
 * SDK with "Authentication Error - invalid username", so the calling routes check
 * this first and return a clear "not enabled yet" response instead.
 */
export const isTwilioConfigured = ![
  env.twilioAccountSid,
  env.twilioAuthToken,
  env.twilioApiKeySid,
  env.twilioApiKeySecret,
  env.twilioTwimlAppSid,
].some((value) => value.toLowerCase().includes('placeholder'));

export const AccessToken = twilio.jwt.AccessToken;
export const VoiceGrant = AccessToken.VoiceGrant;
