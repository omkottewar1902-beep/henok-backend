/**
 * One-off seed script — creates an ACTIVE test QR (bypassing Stripe payment)
 * so we can scan → masked-call a real US number end-to-end.
 *
 * Run with:  npx ts-node scripts/seed-test-qr.ts
 * The scan URL is printed at the end.
 */

import { prisma } from '../src/config/db';

const OWNER_NAME = 'Michael Thompson';
const OWNER_MOBILE = '+19168336757';
const OWNER_EMAIL = 'michael.thompson@jcscan2connect.com';

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { mobile: OWNER_MOBILE },
    update: {},
    create: {
      fullName: OWNER_NAME,
      email: OWNER_EMAIL,
      mobile: OWNER_MOBILE,
    },
  });

  // The extension number is normally allocated inside qr.service.createQr()
  // via a Postgres sequence. Because we're bypassing the service to skip
  // payment, pull the next value from the same sequence directly.
  const sequenceRows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('qr_extension_number_seq') AS nextval
  `;
  const extensionNumber = sequenceRows[0].nextval.toString().padStart(5, '0');

  const qr = await prisma.qr.create({
    data: {
      type: 'CAR',
      status: 'ACTIVE',
      extensionNumber,
      ownerName: OWNER_NAME,
      ownerMobile: OWNER_MOBILE,
      ownerEmail: OWNER_EMAIL,
      addressLine1: '2220 Fraser St',
      addressLine2: null,
      city: 'Aurora',
      state: 'CO',
      zipCode: '80014',
      userId: user.id,
      vehicle: {
        create: {
          vehicleNumber: 'CO-TEST-916',
          vehicleColor: 'Silver',
          speedAlertEnabled: false,
        },
      },
      emergencyContacts: {
        create: [
          {
            name: 'Secondary Contact',
            relationship: 'Friend',
            mobile: OWNER_MOBILE,
          },
        ],
      },
    },
    include: { vehicle: true, emergencyContacts: true },
  });

  const baseUrl = process.env.APP_BASE_URL ?? 'https://henok-backend-r5am.onrender.com';
  const scanUrl = `${baseUrl}/scan/${qr.uniqueCode}`;

  console.log('\n─── Test QR created ─────────────────────────────────────────');
  console.log('  QR id            :', qr.id);
  console.log('  Unique code      :', qr.uniqueCode);
  console.log('  Extension number :', qr.extensionNumber);
  console.log('  Type / status    :', qr.type, '/', qr.status);
  console.log('  Vehicle          :', qr.vehicle?.vehicleNumber);
  console.log('  Owner            :', qr.ownerName, '·', qr.ownerMobile);
  console.log('  Contacts         :', qr.emergencyContacts.length);
  console.log('─────────────────────────────────────────────────────────────');
  console.log('  SCAN THIS URL    :', scanUrl);
  console.log('─────────────────────────────────────────────────────────────\n');
}

main()
  .catch((err) => {
    console.error('[seed-test-qr] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
