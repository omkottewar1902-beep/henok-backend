import { UAParser } from 'ua-parser-js';
import { Request } from 'express';

export interface DeviceInfo {
  ipAddress: string;
  browser: string;
  device: string;
}

export function extractDeviceInfo(req: Request): DeviceInfo {
  const parser = new UAParser(req.headers['user-agent'] ?? '');
  const browserInfo = parser.getBrowser();
  const deviceInfo = parser.getDevice();
  const osInfo = parser.getOS();

  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded?.split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown');

  const browser = [browserInfo.name, browserInfo.version].filter(Boolean).join(' ') || 'unknown';
  const device = [deviceInfo.vendor, deviceInfo.model, osInfo.name].filter(Boolean).join(' ') || 'Desktop';

  return { ipAddress, browser, device };
}

/** Simple caller fingerprint used for blocked-caller matching when no login is available. */
export function callerFingerprint(req: Request): string {
  const { ipAddress, browser, device } = extractDeviceInfo(req);
  return `${ipAddress}|${browser}|${device}`;
}
