import PDFDocument from 'pdfkit';
import { generateQrPngBuffer } from '../../common/utils/qrCode.util';
import { env } from '../../config/env';
import { displayLabel } from './qr.service';

interface ExportableQr {
  uniqueCode: string;
  extensionNumber: string;
  type: string;
  vehicle?: { vehicleNumber: string } | null;
  dog?: { name: string } | null;
  luggage?: { bagDescription: string } | null;
  otherItem?: { itemName: string } | null;
  emergencyContacts?: { id: string }[];
}

const BLACK = '#0B0B0F';
const YELLOW = '#FACC15';
const WHITE = '#FFFFFF';
const GRAY = '#9CA3AF';

function fieldLabel(type: string): string {
  switch (type) {
    case 'CAR':
      return 'Vehicle No.';
    case 'DOG':
      return 'Pet Name';
    case 'LUGGAGE':
      return 'Luggage';
    default:
      return 'Item';
  }
}

/** Draws a simple filled warning triangle with a "!" glyph, matching the sticker's alert icon. */
function drawWarningTriangle(doc: PDFKit.PDFDocument, cx: number, topY: number, size: number): void {
  const halfBase = size / 2;
  doc
    .moveTo(cx, topY)
    .lineTo(cx - halfBase, topY + size)
    .lineTo(cx + halfBase, topY + size)
    .closePath()
    .fill(YELLOW);

  doc
    .fillColor(BLACK)
    .fontSize(size * 0.45)
    .font('Helvetica-Bold')
    .text('!', cx - 4, topY + size * 0.42);
}

/**
 * Builds the printable QR sticker/card as a single-page PDF: black background, yellow
 * warning-style branding, the QR framed in yellow, and the sequential extension number
 * in a yellow pill - matching the physical emergency-sticker design.
 */
export async function buildQrPdfBuffer(qr: ExportableQr): Promise<Buffer> {
  const qrPng = await generateQrPngBuffer(qr.uniqueCode);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A6', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const centerX = pageWidth / 2;

    // Black background fill.
    doc.rect(0, 0, pageWidth, pageHeight).fill(BLACK);

    let y = 16;
    drawWarningTriangle(doc, centerX - 55, y, 18);

    doc
      .fillColor(YELLOW)
      .fontSize(15)
      .font('Helvetica-Bold')
      .text(env.appName.toUpperCase(), centerX - 30, y + 1, { width: pageWidth - (centerX - 30) - 20 });

    y += 30;
    doc
      .fillColor(GRAY)
      .fontSize(9)
      .font('Helvetica')
      .text(fieldLabel(qr.type), 0, y, { align: 'center', width: pageWidth });

    y += 13;
    doc
      .fillColor(WHITE)
      .fontSize(17)
      .font('Helvetica-Bold')
      .text(displayLabel(qr), 0, y, { align: 'center', width: pageWidth });

    y += 28;
    const qrSize = 150;
    const frameSize = qrSize + 20;
    const frameX = centerX - frameSize / 2;
    doc.roundedRect(frameX, y, frameSize, frameSize, 10).lineWidth(3).stroke(YELLOW);
    doc.roundedRect(frameX + 5, y + 5, frameSize - 10, frameSize - 10, 6).fill(WHITE);
    doc.image(qrPng, centerX - qrSize / 2, y + 10, { width: qrSize, height: qrSize });

    y += frameSize + 16;
    const contactCount = qr.emergencyContacts?.length ?? 0;
    doc
      .fillColor(YELLOW)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(
        contactCount > 0 ? `${contactCount} EMERGENCY CONTACT${contactCount > 1 ? 'S' : ''}` : 'OWNER CONTACT ONLY',
        0,
        y,
        { align: 'center', width: pageWidth },
      );

    y += 20;
    doc
      .fillColor(GRAY)
      .fontSize(8)
      .font('Helvetica')
      .text('EXTENSION NUMBER', 0, y, { align: 'center', width: pageWidth });

    y += 12;
    const pillWidth = 100;
    const pillHeight = 24;
    doc.roundedRect(centerX - pillWidth / 2, y, pillWidth, pillHeight, 12).fill(YELLOW);
    doc
      .fillColor(BLACK)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(qr.extensionNumber, centerX - pillWidth / 2, y + 5, { align: 'center', width: pillWidth });

    y += pillHeight + 14;
    doc
      .fillColor(GRAY)
      .fontSize(8)
      .font('Helvetica')
      .text(
        `If you are not the owner, please scan this QR to connect with the owner or registered emergency contact.`,
        32,
        y,
        { align: 'center', width: pageWidth - 64 },
      );

    doc.end();
  });
}
