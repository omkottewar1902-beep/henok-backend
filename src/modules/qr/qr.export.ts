import PDFDocument from 'pdfkit';
import { generateQrPngBuffer } from '../../common/utils/qrCode.util';
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

// ─── Palette (matches the in-app EmergencyStickerCard widget) ───────────────
// Keep in sync with mobile/lib/core/design/design_system.dart.
const BLUE = '#3B82F6';
const BLUE_DARK = '#1D4ED8';
const NAVY = '#122040';
const NAVY_DARK = '#0A1525';
const GOLD = '#FACC15';
const GOLD_DEEP = '#F59E0B';
const GOLD_SOFT = 'rgba(250,204,21,0.55)';
const INK = '#0F1724';
const CREAM = '#F8FAFC'; // near-white for the QR panel inside the dark body
const WHITE = '#FFFFFF';
const MUTED = '#94A3B8';
const CORNER_R = 20;

// Customer-facing brand shown on the printable sticker. The code base's
// internal APP_NAME env var is "JCSafeScan" (historical), but the public
// brand and domain are Jcscan2connect — reviewers and end users only ever
// see this string.
const BRAND = 'JCSCAN2CONNECT';
const WEBSITE_URL = 'jcscan2connect.com';
const SUPPORT_EMAIL = 'support@jcscan2connect.com';

// ─── Shape helpers ──────────────────────────────────────────────────────────

function drawTopRoundedRect(
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

function drawBottomRoundedRect(
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

/** Full-bleed rectangle in a single flat colour (used for the dark body). */
function drawRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  doc.rect(x, y, w, h).fill(color);
}

/** Draws a gold "medical cross" glyph centered at (cx, cy). */
function drawGoldCross(doc: PDFKit.PDFDocument, cx: number, cy: number, size: number): void {
  const arm = size / 3.2;
  doc
    .rect(cx - size / 2, cy - arm / 2, size, arm)
    .rect(cx - arm / 2, cy - size / 2, arm, size)
    .fill(GOLD);
}

/**
 * Draws the QR frame's L-shaped brackets with gold tips at each corner (mirrors
 * the CustomPainter in the Flutter widget).
 */
function drawCornerBrackets(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  size: number,
  bracketLen: number,
  tipLen: number,
  thickness: number,
): void {
  doc.lineWidth(thickness);

  const ink = INK;
  const gold = GOLD;
  const l = bracketLen;
  const t = tipLen;
  const w = size;

  // top-left
  doc.moveTo(x, y + l).lineTo(x, y + t).stroke(ink);
  doc.moveTo(x, y + t).lineTo(x, y).lineTo(x + t, y).stroke(gold);
  doc.moveTo(x + t, y).lineTo(x + l, y).stroke(ink);

  // top-right
  doc.moveTo(x + w - l, y).lineTo(x + w - t, y).stroke(ink);
  doc.moveTo(x + w - t, y).lineTo(x + w, y).lineTo(x + w, y + t).stroke(gold);
  doc.moveTo(x + w, y + t).lineTo(x + w, y + l).stroke(ink);

  // bottom-left
  doc.moveTo(x, y + w - l).lineTo(x, y + w - t).stroke(ink);
  doc.moveTo(x, y + w - t).lineTo(x, y + w).lineTo(x + t, y + w).stroke(gold);
  doc.moveTo(x + t, y + w).lineTo(x + l, y + w).stroke(ink);

  // bottom-right
  doc.moveTo(x + w - l, y + w).lineTo(x + w - t, y + w).stroke(ink);
  doc.moveTo(x + w - t, y + w).lineTo(x + w, y + w).lineTo(x + w, y + w - t).stroke(gold);
  doc.moveTo(x + w, y + w - t).lineTo(x + w, y + w - l).stroke(ink);
}

/** Draws a small rotated diamond (used in the ornamental divider). */
function drawDiamond(doc: PDFKit.PDFDocument, cx: number, cy: number, size: number, color: string): void {
  doc
    .moveTo(cx, cy - size / 2)
    .lineTo(cx + size / 2, cy)
    .lineTo(cx, cy + size / 2)
    .lineTo(cx - size / 2, cy)
    .closePath()
    .fill(color);
}

/** Hairline rule between elements — subtle gold, matches the app widget. */
function drawGoldHairline(
  doc: PDFKit.PDFDocument,
  x1: number,
  x2: number,
  y: number,
  opacity = 0.55,
): void {
  doc.save();
  doc.lineWidth(0.6);
  doc.strokeOpacity(opacity);
  doc.moveTo(x1, y).lineTo(x2, y).stroke(GOLD);
  doc.restore();
}

// ─── Ornament icons for the footer tags ─────────────────────────────────────

function drawWarningTri(doc: PDFKit.PDFDocument, cx: number, cy: number, size: number): void {
  const half = size / 2;
  doc
    .moveTo(cx, cy - half)
    .lineTo(cx - half, cy + half)
    .lineTo(cx + half, cy + half)
    .closePath()
    .lineWidth(1.1)
    .stroke(GOLD);
  doc
    .fillColor(GOLD)
    .fontSize(size * 0.55)
    .font('Helvetica-Bold')
    .text('!', cx - size * 0.13, cy - size * 0.22);
}

function drawPin(doc: PDFKit.PDFDocument, cx: number, cy: number, size: number): void {
  const r = size / 2;
  doc
    .moveTo(cx, cy + r)
    .quadraticCurveTo(cx - r, cy + r / 2, cx - r, cy - r / 4)
    .quadraticCurveTo(cx - r, cy - r, cx, cy - r)
    .quadraticCurveTo(cx + r, cy - r, cx + r, cy - r / 4)
    .quadraticCurveTo(cx + r, cy + r / 2, cx, cy + r)
    .lineWidth(1.1)
    .stroke(GOLD);
  doc.circle(cx, cy - r / 4, r * 0.24).fill(GOLD);
}

function drawPCircle(doc: PDFKit.PDFDocument, cx: number, cy: number, size: number): void {
  const r = size / 2;
  doc.circle(cx, cy, r).lineWidth(1.1).stroke(GOLD);
  doc
    .fillColor(GOLD)
    .fontSize(size * 0.65)
    .font('Helvetica-Bold')
    .text('P', cx - size * 0.2, cy - size * 0.32);
}

/** Small gold-outlined tile used behind the globe/envelope icons in the footer. */
function drawIconTile(doc: PDFKit.PDFDocument, x: number, y: number, size: number): void {
  doc
    .roundedRect(x, y, size, size, 3)
    .lineWidth(0.7)
    .fillOpacity(0.14)
    .fillAndStroke(WHITE, GOLD);
  doc.fillOpacity(1);
}

// ─── Main render ────────────────────────────────────────────────────────────

/**
 * Builds the printable emergency-sticker PDF. The visual language mirrors the
 * in-app `EmergencyStickerCard` widget (mobile/lib/core/widgets) so the
 * physical sticker and the app preview feel like the same product — dark navy
 * card body with blue-gradient banners and gold accents.
 */
export async function buildQrPdfBuffer(qr: ExportableQr): Promise<Buffer> {
  const qrPng = await generateQrPngBuffer(qr.uniqueCode);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A6', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const cx = pageW / 2;

    // ─── Body background (dark navy, full-bleed) ─────────────────────────
    drawRect(doc, 0, 0, pageW, pageH, NAVY_DARK);

    // ─── Header (blue gradient, rounded top corners) ─────────────────────
    const headerH = 68;
    const headerGrad = doc.linearGradient(0, 0, pageW, headerH);
    headerGrad.stop(0, BLUE).stop(1, BLUE_DARK);
    drawTopRoundedRect(doc, 0, 0, pageW, headerH, CORNER_R, headerGrad as unknown as string);

    // Subtle radial highlight in the top-right for a glossy embossed feel.
    doc.save();
    doc.circle(pageW - 30, -20, 70).fillOpacity(0.09).fill(WHITE);
    doc.restore();

    // Brand text — letter-spaced, matching the widget
    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(19)
      .text(spaceOut(BRAND), 0, 18, {
        align: 'center',
        width: pageW,
        characterSpacing: 1.4,
      });

    // Gold accent bar under the brand
    doc.save();
    const barX = cx - 22;
    doc.rect(barX, 46, 44, 1.2).fillOpacity(0.9).fill(GOLD);
    doc.restore();

    // "SCAN TO CALL OWNER" subtitle
    doc
      .fillColor(WHITE)
      .fillOpacity(0.92)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('SCAN TO CALL OWNER', 0, 52, {
        align: 'center',
        width: pageW,
        characterSpacing: 3.5,
      });
    doc.fillOpacity(1);

    // Gold hairline separating header from body
    drawGoldHairline(doc, 0, pageW, headerH, 0.9);

    // ─── QR frame (white panel inside dark body, gold-tipped brackets) ───
    const bodyPadX = 22;
    const qrPanelW = pageW - bodyPadX * 2;
    const qrPanelH = qrPanelW; // square
    const qrPanelX = bodyPadX;
    const qrPanelY = headerH + 18;

    // Soft gold glow around the QR panel
    doc.save();
    doc.roundedRect(qrPanelX - 3, qrPanelY - 3, qrPanelW + 6, qrPanelH + 6, 10);
    doc.fillOpacity(0.12).fill(GOLD);
    doc.restore();

    // White panel
    doc.roundedRect(qrPanelX, qrPanelY, qrPanelW, qrPanelH, 8).fill(WHITE);

    // Corner brackets with gold tips
    drawCornerBrackets(doc, qrPanelX, qrPanelY, qrPanelW, 24, 8, 3);

    // The QR image itself, padded inside the panel
    const qrPad = 14;
    doc.image(qrPng, qrPanelX + qrPad, qrPanelY + qrPad, {
      width: qrPanelW - qrPad * 2,
      height: qrPanelH - qrPad * 2,
    });

    // Muted item label under the QR (which specific sticker this is)
    let y = qrPanelY + qrPanelH + 10;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7.5)
      .text(displayLabel(qr).toUpperCase(), 0, y, {
        align: 'center',
        width: pageW,
        characterSpacing: 1,
      });

    // ─── Ornamental gold divider (hairline · diamond · hairline) ─────────
    y += 18;
    const dividerY = y;
    const gap = 30;
    drawGoldHairline(doc, bodyPadX, cx - gap / 2, dividerY, 0.4);
    drawDiamond(doc, cx, dividerY, 6, GOLD);
    drawGoldHairline(doc, cx + gap / 2, pageW - bodyPadX, dividerY, 0.4);

    // ─── "EXTENSION NUMBER" label (muted gold) ───────────────────────────
    y += 14;
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('EXTENSION NUMBER', 0, y, {
        align: 'center',
        width: pageW,
        characterSpacing: 2.4,
      });

    // ─── Brand + cross + extension pill + cross + brand row ──────────────
    y += 15;
    const rowY = y;
    const pillW = 78;
    const pillH = 24;
    const pillX = cx - pillW / 2;
    const pillYPos = rowY;

    // Extension pill: gold gradient with dark navy text
    const pillGrad = doc.linearGradient(pillX, pillYPos, pillX + pillW, pillYPos + pillH);
    pillGrad.stop(0, GOLD).stop(1, GOLD_DEEP);
    doc.save();
    doc.roundedRect(pillX, pillYPos, pillW, pillH, 6).fill(pillGrad as unknown as string);
    doc.restore();
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(qr.extensionNumber, pillX, pillYPos + 5, {
        align: 'center',
        width: pillW,
        characterSpacing: 1.5,
      });

    // Flanking brand text + crosses
    const brandShort = BRAND.length > 6 ? BRAND.substring(0, 4) : BRAND;
    const brandFontSize = 9;
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(brandFontSize);
    const brandWidth = doc.widthOfString(brandShort);
    const flankGap = 6;
    const crossSize = 12;

    // Left: BRAND + cross
    const leftBrandX = pillX - flankGap - crossSize - 4 - brandWidth;
    doc.text(brandShort, leftBrandX, pillYPos + pillH / 2 - brandFontSize / 2 - 1, {
      lineBreak: false,
      characterSpacing: 1.4,
    });
    drawGoldCross(doc, pillX - flankGap - crossSize / 2, pillYPos + pillH / 2, crossSize);

    // Right: cross + BRAND
    drawGoldCross(doc, pillX + pillW + flankGap + crossSize / 2, pillYPos + pillH / 2, crossSize);
    doc
      .fillColor(GOLD)
      .font('Helvetica-Bold')
      .fontSize(brandFontSize)
      .text(brandShort, pillX + pillW + flankGap + crossSize + 4, pillYPos + pillH / 2 - brandFontSize / 2 - 1, {
        lineBreak: false,
        characterSpacing: 1.4,
      });

    // ─── Footer (blue gradient, rounded bottom corners) ──────────────────
    const footerH = 62;
    const footerY = pageH - footerH;

    // Gold hairline above the footer
    drawGoldHairline(doc, 0, pageW, footerY, 0.9);

    const footerGrad = doc.linearGradient(0, footerY, pageW, pageH);
    footerGrad.stop(0, BLUE).stop(1, BLUE_DARK);
    drawBottomRoundedRect(doc, 0, footerY, pageW, footerH, CORNER_R, footerGrad as unknown as string);

    // Row 1: globe + URL   ·   envelope + email
    const row1Y = footerY + 10;
    const half = pageW / 2;

    // Globe tile + circle glyph
    const globeTileX = 12;
    drawIconTile(doc, globeTileX, row1Y, 12);
    const globeCX = globeTileX + 6;
    const globeCY = row1Y + 6;
    doc.circle(globeCX, globeCY, 3.2).lineWidth(0.8).stroke(GOLD);
    doc.moveTo(globeCX - 3.2, globeCY).lineTo(globeCX + 3.2, globeCY).stroke(GOLD);
    doc.moveTo(globeCX, globeCY - 3.2).lineTo(globeCX, globeCY + 3.2).stroke(GOLD);

    doc
      .fillColor(WHITE)
      .font('Helvetica')
      .fontSize(8)
      .text(WEBSITE_URL, globeTileX + 16, row1Y + 2, { width: half - 22, lineBreak: false });

    // Envelope tile + glyph
    const envTileX = half + 6;
    drawIconTile(doc, envTileX, row1Y, 12);
    const envX = envTileX + 2;
    const envY = row1Y + 4;
    doc.roundedRect(envX, envY, 8, 6, 0.8).lineWidth(0.8).stroke(GOLD);
    doc.moveTo(envX, envY).lineTo(envX + 4, envY + 3.6).lineTo(envX + 8, envY).stroke(GOLD);

    doc
      .fillColor(WHITE)
      .font('Helvetica')
      .fontSize(8)
      .text(SUPPORT_EMAIL, envTileX + 16, row1Y + 2, { width: half - 22, lineBreak: false });

    // Divider (gold hairline)
    drawGoldHairline(doc, 12, pageW - 12, row1Y + 20, 0.55);

    // Row 2: three category tags
    const tagY = row1Y + 30;
    const iconSize = 10;
    const thirdW = pageW / 3;

    // ACCIDENT
    const cx1 = thirdW / 2 - 22;
    drawWarningTri(doc, cx1, tagY + 6, iconSize);
    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('ACCIDENT', cx1 + 10, tagY + 2, { lineBreak: false, characterSpacing: 0.4 });

    // TRACKING
    const cx2 = thirdW + thirdW / 2 - 22;
    drawPin(doc, cx2, tagY + 6, iconSize);
    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('TRACKING', cx2 + 10, tagY + 2, { lineBreak: false, characterSpacing: 0.4 });

    // NO PARKING
    const cx3 = 2 * thirdW + thirdW / 2 - 28;
    drawPCircle(doc, cx3, tagY + 6, iconSize);
    doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('NO PARKING', cx3 + 10, tagY + 2, { lineBreak: false, characterSpacing: 0.4 });

    doc.end();
  });
}

/** Turns "JCSCAN2CONNECT" into "J C S C A N 2 C O N N E C T" for the header wordmark. */
function spaceOut(s: string): string {
  return s.split('').join(' ');
}
