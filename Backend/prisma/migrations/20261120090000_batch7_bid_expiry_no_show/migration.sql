-- Bid expiry (24 hours) and no-show penalties
ALTER TYPE "BidStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'BID_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'DRIVER_PENALTY';

CREATE TYPE "PenaltyStatus" AS ENUM ('ACTIVE', 'WAIVED');

CREATE TABLE "DriverPenalty" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "flaggedById" TEXT NOT NULL,
    "reason" TEXT,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'ACTIVE',
    "waivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverPenalty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DriverPenalty_userId_shipmentId_key" ON "DriverPenalty"("userId", "shipmentId");
CREATE INDEX "DriverPenalty_userId_status_createdAt_idx" ON "DriverPenalty"("userId", "status", "createdAt");

ALTER TABLE "DriverPenalty" ADD CONSTRAINT "DriverPenalty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverPenalty" ADD CONSTRAINT "DriverPenalty_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
