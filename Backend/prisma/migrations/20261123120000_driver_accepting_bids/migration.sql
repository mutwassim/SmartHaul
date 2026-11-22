-- Accepting bids switch and the latest shared position of a driver (FR-DR-19)
ALTER TABLE "User" ADD COLUMN "isAcceptingBids" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "lastLat" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "lastLng" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "lastLocationAt" TIMESTAMP(3);
