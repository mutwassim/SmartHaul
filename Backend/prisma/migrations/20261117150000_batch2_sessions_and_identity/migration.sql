-- AlterEnum
ALTER TYPE "AuthAction" ADD VALUE 'REGISTERED';
ALTER TYPE "AuthAction" ADD VALUE 'PROFILE_UPDATED';
ALTER TYPE "AuthAction" ADD VALUE 'DOCUMENT_UPLOADED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstFailedAt" TIMESTAMP(3),
ADD COLUMN     "statusBeforeSuspension" "AccountStatus",
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RevokedToken" (
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "RevokedToken_expiresAt_idx" ON "RevokedToken"("expiresAt");

-- CreateIndex (one account per CNIC per role, BR-2)
CREATE UNIQUE INDEX "User_cnicHash_role_key" ON "User"("cnicHash", "role");

-- Reset tokens are now stored as hashes: tokens issued before this change cannot match, so retire them
UPDATE "PasswordResetToken" SET "isUsed" = true;
