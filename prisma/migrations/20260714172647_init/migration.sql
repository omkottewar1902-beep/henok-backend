-- CreateEnum
CREATE TYPE "QrType" AS ENUM ('CAR', 'DOG', 'LUGGAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "QrStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScanAction" AS ENUM ('VIEWED', 'CALL_OWNER', 'CALL_EMERGENCY');

-- CreateEnum
CREATE TYPE "CallerType" AS ENUM ('OWNER', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('INITIATED', 'ANSWERED', 'MISSED', 'BUSY', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('QR_CREATED', 'PAYMENT_SUCCESS', 'QR_SCANNED', 'INCOMING_CALL', 'EMERGENCY_CONTACT_CALLED', 'SPEED_ALERT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" TEXT NOT NULL,
    "uniqueCode" TEXT NOT NULL,
    "type" "QrType" NOT NULL,
    "status" "QrStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "ownerName" TEXT NOT NULL,
    "ownerMobile" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "vehicleMake" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehicleColor" TEXT,
    "speedAlertEnabled" BOOLEAN NOT NULL DEFAULT false,
    "qrId" TEXT NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dogs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "breed" TEXT NOT NULL,
    "photoUrl" TEXT,
    "qrId" TEXT NOT NULL,

    CONSTRAINT "dogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "luggage" (
    "id" TEXT NOT NULL,
    "bagDescription" TEXT NOT NULL,
    "imageUrl" TEXT,
    "qrId" TEXT NOT NULL,

    CONSTRAINT "luggage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "other_items" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,

    CONSTRAINT "other_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 5.00,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "stripePaymentIntent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_logs" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT,
    "browser" TEXT,
    "device" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "actionTaken" "ScanAction" NOT NULL DEFAULT 'VIEWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qrId" TEXT NOT NULL,

    CONSTRAINT "scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "callerType" "CallerType" NOT NULL,
    "targetMobile" TEXT NOT NULL,
    "twilioCallSid" TEXT,
    "durationSec" INTEGER,
    "status" "CallStatus" NOT NULL DEFAULT 'INITIATED',
    "callerIp" TEXT,
    "callerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "qrId" TEXT NOT NULL,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_callers" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qrId" TEXT NOT NULL,

    CONSTRAINT "blocked_callers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_key" ON "users"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_uniqueCode_key" ON "qr_codes"("uniqueCode");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_qrId_key" ON "vehicles"("qrId");

-- CreateIndex
CREATE UNIQUE INDEX "dogs_qrId_key" ON "dogs"("qrId");

-- CreateIndex
CREATE UNIQUE INDEX "luggage_qrId_key" ON "luggage"("qrId");

-- CreateIndex
CREATE UNIQUE INDEX "other_items_qrId_key" ON "other_items"("qrId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripeSessionId_key" ON "payments"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_callers_qrId_identifier_key" ON "blocked_callers"("qrId", "identifier");

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "luggage" ADD CONSTRAINT "luggage_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_items" ADD CONSTRAINT "other_items_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_callers" ADD CONSTRAINT "blocked_callers_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
