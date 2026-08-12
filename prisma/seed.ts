import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { mobile: '+14155550123' },
    update: {},
    create: {
      fullName: 'Raj Gaikwad',
      email: 'raj@example.com',
      mobile: '+14155550123',
    },
  });

  const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('qr_extension_number_seq')`;
  const extensionNumber = nextval.toString().padStart(5, '0');

  const qr = await prisma.qr.upsert({
    where: { uniqueCode: 'demo-car-qr' },
    update: {},
    create: {
      uniqueCode: 'demo-car-qr',
      extensionNumber,
      type: 'CAR',
      status: 'ACTIVE',
      userId: user.id,
      ownerName: user.fullName,
      ownerMobile: user.mobile,
      ownerEmail: user.email,
      addressLine1: '221B Baker Street',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94105',
      vehicle: {
        create: {
          vehicleNumber: 'MH56GT564',
          vehicleMake: 'Toyota',
          vehicleModel: 'Camry',
          vehicleColor: 'White',
        },
      },
      emergencyContacts: {
        create: [{ name: 'Jane Doe', relationship: 'Spouse', mobile: '+14155550456' }],
      },
    },
  });

  console.log(`Seeded user ${user.mobile} with demo QR /scan/${qr.uniqueCode}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
