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

const RED = '#D91E2A';
const RED_DARK = '#A81622';
const WHITE = '#FFFFFF';
const BLACK = '#0B0B0F';
const GRAY = '#6B7280';
const CORNER_R = 14;

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function supportEmailFrom(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).host.replace(/^www\./, '');
    return `support@${host}`;
  } catch {
    return 'support@example.com';
  }
}

/** Draws a filled cross (Red Cross-style plus symbol). */
function drawCross(doc: PDFKit.PDFDocument, cx: number, cy: number, size: number, color: string): void {
  const arm = size / 3;
  doc
    .rect(cx - size / 2, cy - arm / 2, size, arm)
    .rect(cx - arm / 2, cy - size / 2, arm, size)
    .fill(color);
}

/** Draws a warning triangle with a "!" glyph. */
function drawWarning(doc: PDFKit.PDFDocument, cx: number, cy: number, size: number, color: string): void {
  const half = size / 2;
  doc
    .moveTo(cx, cy - half)
    .lineTo(cx - half, cy + half)
    .lineTo(cx + half, cy + half)
    .closePath()
    .fill(color);
  doc
    .fillColor(WHITE)
    .fontSize(size * 0.55)
    .font('Helvetica-Bold')
    .text('!', cx - size * 0.14, cy - size * 0.28);
}

/** Draws a location pin (teardrop with a dot). */
function drawPin(doc: PDFKit.PDFDocument, cx: number, cy: number, size: number, color: string): void {
  const r = size / 2;
  doc.save();
  doc
    .moveTo(cx, cy + r)
    .quadraticCurveTo(cx - r, cy + r / 2, cx - r, cy - r / 4)
    .quadraticCurveTo(cx - r, cy - r, cx, cy - r)
    .quadraticCurveTo(cx + r, cy - r, cx + r, cy - r / 4)
    .quadraticCurveTo(cx + r, cy + r / 2, cx, cy + r)
    .fill(color);
  doc.restore();
  doc
    .circle(cx, cy - r / 4, r * 0.25)
    .fill(WHITE);
}

/** Draws a circle with a bold letter inside (e.g. Ⓟ). */
function drawLetterInCircle(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  size: number,
  letter: string,
  color: string,
): void {
  const r = size / 2;
  doc.circle(cx, cy, r).fill(color);
  doc
    .fillColor(WHITE)
    .fontSize(size * 0.65)
    .font('Helvetica-Bold')
    .text(letter, cx - size * 0.2, cy - size * 0.35);
}

/** Draws a rounded rectangle clipped to only round the top or bottom corners. */
function drawTopRoundedBanner(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  doc
    .moveTo(x + r, y)
    .lineTo(x + w - r, y)
    .quadraticCurveTo(x + w, y, x + w, y + r)
    .lineTo(x + w, y + h)
    .lineTo(x, y + h)
    .lineTo(x, y + r)
    .quadraticCurveTo(x, y, x + r, y)
    .fill(color);
}

function drawBottomRoundedBanner(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  doc
    .moveTo(x, y)
    .lineTo(x + w, y)
    .lineTo(x + w, y + h - r)
    .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    .lineTo(x + r, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - r)
    .lineTo(x, y)
    .fill(color);
}

/** Draws L-shaped corner brackets around the QR area. */
function drawCornerBrackets(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  size: number,
  bracketLen: number,
  thickness: number,
  color: string,
): void {
  doc.lineWidth(thickness).strokeColor(color);
  // top-left
  doc.moveTo(x, y + bracketLen).lineTo(x, y).lineTo(x + bracketLen, y).stroke();
  // top-right
  doc
    .moveTo(x + size - bracketLen, y)
    .lineTo(x + size, y)
    .lineTo(x + size, y + bracketLen)
    .stroke();
  // bottom-left
  doc
    .moveTo(x, y + size - bracketLen)
    .lineTo(x, y + size)
    .lineTo(x + bracketLen, y + size)
    .stroke();
  // bottom-right
  doc
    .moveTo(x + size - bracketLen, y + size)
    .lineTo(x + size, y + size)
    .lineTo(x + size, y + size - bracketLen)
    .stroke();
}

/**
 * Builds the printable emergency-sticker PDF. Layout mirrors the physical
 * QR-4-Emergency reference: red header banner, white body with the framed
 * QR + extension pill flanked by brand crosses, and a red footer banner
 * showing the site URL, support email and three category tags.
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

    const brand = env.appName.toUpperCase();
    const displayUrl = stripProtocol(env.appBaseUrl);
    const email = supportEmailFrom(env.appBaseUrl);

    // Overall white background (visible in the middle band).
    doc.rect(0, 0, pageWidth, pageHeight).fill(WHITE);

    // ─── Red header ─────────────────────────────────────────────────────────
    const headerH = 66;
    drawTopRoundedBanner(doc, 0, 0, pageWidth, headerH, CORNER_R, RED);

    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(`${brand}`, 0, 14, { align: 'center', width: pageWidth, characterSpacing: 1 });

    doc
      .fillColor(WHITE)
      .font('Helvetica')
      .fontSize(10)
      .text('SCAN TO CALL OWNER', 0, 44, { align: 'center', width: pageWidth, characterSpacing: 3 });

    // ─── QR code area ───────────────────────────────────────────────────────
    const qrSize = 168;
    const qrX = centerX - qrSize / 2;
    const qrY = headerH + 22;
    const bracketPad = 10;
    drawCornerBrackets(
      doc,
      qrX - bracketPad,
      qrY - bracketPad,
      qrSize + bracketPad * 2,
      22,
      3,
      BLACK,
    );
    doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });

    // Subtle item label under the QR (helps owner identify which sticker is which).
    const labelY = qrY + qrSize + 6;
    doc
      .fillColor(GRAY)
      .font('Helvetica')
      .fontSize(8)
      .text(displayLabel(qr).toUpperCase(), 0, labelY, {
        align: 'center',
        width: pageWidth,
        characterSpacing: 1,
      });

    // ─── Extension number label + pill flanked by brand crosses ─────────────
    const extLabelY = labelY + 16;
    doc
      .fillColor(BLACK)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Extension Number', 0, extLabelY, {
        align: 'center',
        width: pageWidth,
        characterSpacing: 0.4,
      });

    const pillY = extLabelY + 16;
    const pillW = 82;
    const pillH = 28;
    const pillX = centerX - pillW / 2;

    // Extension pill (white with red border).
    doc
      .roundedRect(pillX, pillY, pillW, pillH, 6)
      .lineWidth(2)
      .fillAndStroke(WHITE, RED);
    doc
      .fillColor(RED_DARK)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(qr.extensionNumber, pillX, pillY + 6, {
        align: 'center',
        width: pillW,
        characterSpacing: 1,
      });

    // Flanking brand text with a red cross on each side.
    const brandFontSize = 11;
    doc.fillColor(RED).font('Helvetica-Bold').fontSize(brandFontSize);
    const brandWidth = doc.widthOfString(brand);
    const flankGap = 8;
    const crossSize = 12;

    // Left side: BRAND + cross
    const leftBrandX = pillX - flankGap - crossSize - 4 - brandWidth;
    doc.text(brand, leftBrandX, pillY + pillH / 2 - brandFontSize / 2 - 1, {
      lineBreak: false,
    });
    drawCross(doc, pillX - flankGap - crossSize / 2, pillY + pillH / 2, crossSize, RED);

    // Right side: cross + BRAND
    drawCross(doc, pillX + pillW + flankGap + crossSize / 2, pillY + pillH / 2, crossSize, RED);
    doc
      .fillColor(RED)
      .font('Helvetica-Bold')
      .fontSize(brandFontSize)
      .text(
        brand,
        pillX + pillW + flankGap + crossSize + 4,
        pillY + pillH / 2 - brandFontSize / 2 - 1,
        { lineBreak: false },
      );

    // ─── Red footer ─────────────────────────────────────────────────────────
    const footerH = 60;
    const footerY = pageHeight - footerH;
    drawBottomRoundedBanner(doc, 0, footerY, pageWidth, footerH, CORNER_R, RED);

    // Row 1: URL and email side by side.
    const row1Y = footerY + 10;
    const halfW = pageWidth / 2;

    // Simple globe glyph — circle with an equator line.
    const globeCX = 16;
    const globeCY = row1Y + 6;
    doc.circle(globeCX, globeCY, 5).lineWidth(1).strokeColor(WHITE).stroke();
    doc.moveTo(globeCX - 5, globeCY).lineTo(globeCX + 5, globeCY).stroke();
    doc.moveTo(globeCX, globeCY - 5).lineTo(globeCX, globeCY + 5).stroke();

    doc
      .fillColor(WHITE)
      .font('Helvetica')
      .fontSize(8)
      .text(displayUrl, 26, row1Y + 2, { width: halfW - 30, lineBreak: false });

    // Envelope glyph — rounded rect + diagonals.
    const envX = halfW + 6;
    const envY = row1Y + 1;
    doc.roundedRect(envX, envY, 12, 8, 1).lineWidth(1).strokeColor(WHITE).stroke();
    doc.moveTo(envX, envY).lineTo(envX + 6, envY + 5).lineTo(envX + 12, envY).stroke();

    doc
      .fillColor(WHITE)
      .font('Helvetica')
      .fontSize(8)
      .text(email, envX + 16, row1Y + 2, { width: halfW - 22, lineBreak: false });

    // Divider hairline.
    const dividerY = row1Y + 18;
    doc
      .moveTo(12, dividerY)
      .lineTo(pageWidth - 12, dividerY)
      .lineWidth(0.5)
      .strokeColor('rgba(255,255,255,0.4)')
      .stroke();

    // Row 2: three category tags.
    const tagY = dividerY + 6;
    const iconSize = 12;
    const thirdW = pageWidth / 3;

    // ACCIDENT
    const cx1 = thirdW / 2 - 22;
    drawWarning(doc, cx1, tagY + 8, iconSize, WHITE);
    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('ACCIDENT', cx1 + 10, tagY + 4, { lineBreak: false, characterSpacing: 0.4 });

    // TRACKING
    const cx2 = thirdW + thirdW / 2 - 22;
    drawPin(doc, cx2, tagY + 8, iconSize, WHITE);
    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('TRACKING', cx2 + 10, tagY + 4, { lineBreak: false, characterSpacing: 0.4 });

    // NO PARKING
    const cx3 = 2 * thirdW + thirdW / 2 - 28;
    drawLetterInCircle(doc, cx3, tagY + 8, iconSize, 'P', WHITE);
    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('NO PARKING', cx3 + 10, tagY + 4, { lineBreak: false, characterSpacing: 0.4 });

    doc.end();
  });
}
