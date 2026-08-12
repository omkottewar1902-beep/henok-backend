import QRCode from 'qrcode';
import { env } from '../../config/env';

export function scanUrlForCode(uniqueCode: string): string {
  return `${env.scanPublicUrl}/${uniqueCode}`;
}

export async function generateQrPngDataUrl(uniqueCode: string): Promise<string> {
  const url = scanUrlForCode(uniqueCode);
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 600,
  });
}

export async function generateQrPngBuffer(uniqueCode: string): Promise<Buffer> {
  const url = scanUrlForCode(uniqueCode);
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 600,
  });
}
