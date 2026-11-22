-- Batch 3: bidding and booking integrity (C-05, C-11, C-17, C-20, C-47)
ALTER TABLE "Bid" ADD COLUMN "vehicleId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "cancelledTripsCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Bid_vehicleId_idx" ON "Bid"("vehicleId");
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep only the newest active bid per bidder and shipment before enforcing uniqueness
UPDATE "Bid" SET "status" = 'WITHDRAWN'
WHERE "status" = 'ACTIVE'
  AND "id" NOT IN (
    SELECT DISTINCT ON ("shipmentId", "bidderId") "id" FROM "Bid"
    WHERE "status" = 'ACTIVE'
    ORDER BY "shipmentId", "bidderId", "createdAt" DESC
  );

-- At most one active bid per bidder per shipment (BR-7). Partial index, so it is not expressed in schema.prisma.
CREATE UNIQUE INDEX "Bid_one_active_per_bidder" ON "Bid"("shipmentId", "bidderId") WHERE "status" = 'ACTIVE';
