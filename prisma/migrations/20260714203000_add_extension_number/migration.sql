-- Sequential, unique, human-readable reference number printed on the physical QR
-- sticker/card. Starts at 1011 and is zero-padded to 5 digits at read time in app code.
CREATE SEQUENCE IF NOT EXISTS "qr_extension_number_seq" START WITH 1011 INCREMENT BY 1;

ALTER TABLE "qr_codes" ADD COLUMN "extensionNumber" TEXT;

-- Backfill any existing rows so the NOT NULL + UNIQUE constraints below can be applied.
UPDATE "qr_codes"
SET "extensionNumber" = LPAD(nextval('qr_extension_number_seq')::text, 5, '0')
WHERE "extensionNumber" IS NULL;

ALTER TABLE "qr_codes" ALTER COLUMN "extensionNumber" SET NOT NULL;

CREATE UNIQUE INDEX "qr_codes_extensionNumber_key" ON "qr_codes"("extensionNumber");
