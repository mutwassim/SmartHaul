-- Batch 5: payee separated from performing driver (C-09), fleet invitations (C-10), message and invitation notification types (C-37)
ALTER TYPE "NotificationType" ADD VALUE 'NEW_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE 'FLEET_INVITATION';

CREATE TYPE "LinkStatus" AS ENUM ('INVITED', 'ACTIVE');
-- Links that exist today were made under the old rules: keep them working
ALTER TABLE "DriverFleetLink" ADD COLUMN "status" "LinkStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "DriverFleetLink" ALTER COLUMN "status" SET DEFAULT 'INVITED';

ALTER TABLE "PaymentRecord" ADD COLUMN "payeeId" TEXT;
UPDATE "PaymentRecord" SET "payeeId" = COALESCE("fleetOwnerId", "driverId");
CREATE INDEX "PaymentRecord_payeeId_idx" ON "PaymentRecord"("payeeId");
