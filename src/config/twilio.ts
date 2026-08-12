import twilio from 'twilio';
import { env } from './env';

export const twilioClient = twilio(env.twilioAccountSid, env.twilioAuthToken);

export const AccessToken = twilio.jwt.AccessToken;
export const VoiceGrant = AccessToken.VoiceGrant;
