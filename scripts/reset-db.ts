/**
 * One-off DB reset — deletes ALL data in every table while keeping the schema
 * + migration history intact, then resets the extension-number sequence so
 * the next QR seeded gets 10001 again.
 *
 * ⚠️  DESTRUCTIVE. Blows away users, QRs, contacts, scans, calls, payments.
 * ⚠️  Runs against whatever DATABASE_URL / DIRECT_URL is in backend/.env — so
 *     if that still points at production Supabase, this wipes PRODUCTION.
 *
 * Run with:
 *   cd d:/Projects/Henok/Henok/backend
 *   npx ts-node scripts/reset-db.ts
 *
 * Press Ctrl+C within 5 seconds if you ran it by mistake.
 */

import { prisma } from '../src/config/db';

async function confirmPrompt(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '(not set)';
  const redacted = url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
  console.log('');
  console.log('⚠️  About to DELETE ALL DATA from:');
  console.log(`    ${redacted}`);
  console.log('');
  console.log('    Press Ctrl+C in the next 5 seconds to abort.');
  console.log('');
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function main(): Promise<void> {
  await confirmPrompt();

  console.log('→ Clearing dependent tables (children first)…');

  // Children of QR / User
  const scan = await prisma.scanLog.deleteMany();
  console.log(`   scan_logs:         ${scan.count}`);

  const call = await prisma.callLog.deleteMany();
  console.log(`   call_logs:         ${call.count}`);

  const blocked = await prisma.blockedCaller.deleteMany();
  console.log(`   blocked_callers:   ${blocked.count}`);

  const notif = await prisma.notification.deleteMany();
  console.log(`   notifications:     ${notif.count}`);

  const payment = await prisma.payment.deleteMany();
  console.log(`   payments:          ${payment.count}`);

  const contacts = await prisma.emergencyContact.deleteMany();
  console.log(`   emergency_contacts: ${contacts.count}`);

  // QR-type-specific one-to-one tables
  const vehicle = await prisma.vehicle.deleteMany();
  console.log(`   vehicles:          ${vehicle.count}`);

  const dog = await prisma.dog.deleteMany();
  console.log(`   dogs:              ${dog.count}`);

  const luggage = await prisma.luggage.deleteMany();
  console.log(`   luggage:           ${luggage.count}`);

  const other = await prisma.otherItem.deleteMany();
  console.log(`   other_items:       ${other.count}`);

  // Parents
  const qr = await prisma.qr.deleteMany();
  console.log(`   qrs:               ${qr.count}`);

  const user = await prisma.user.deleteMany();
  console.log(`   users:             ${user.count}`);

  // Reset the extension-number sequence so the next seeded QR gets 10001
  await prisma.$executeRawUnsafe(
    `ALTER SEQUENCE "qr_extension_number_seq" RESTART WITH 10001`,
  );
  console.log('   qr_extension_number_seq: restarted at 10001');

  console.log('');
  console.log('✅ Done. Database is empty. Run the admin seed to create a fresh test QR.');
}

main()
  .catch((err) => {
    console.error('[reset-db] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
