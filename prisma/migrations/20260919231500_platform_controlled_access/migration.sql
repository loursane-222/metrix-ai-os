-- Additive platform control plane. No tenant/business tables or historical
-- Company Truth records are modified or deleted.
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'ADMIN');
CREATE TYPE "PlatformAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "AccessApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "PlatformSubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE';
ALTER TABLE "User" ADD COLUMN "platformStatus" "PlatformAccountStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "AccessApplication" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL,
  "company" TEXT NOT NULL, "phone" TEXT, "note" TEXT,
  "status" "AccessApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedAt" TIMESTAMP(3), "reviewedById" TEXT, "rejectionReason" TEXT,
  "invitationId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AccessApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccessApplication_email_key" ON "AccessApplication"("email");
CREATE UNIQUE INDEX "AccessApplication_invitationId_key" ON "AccessApplication"("invitationId");
CREATE INDEX "AccessApplication_status_createdAt_idx" ON "AccessApplication"("status", "createdAt");

CREATE TABLE "PlatformInvitation" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT, "company" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3),
  "acceptedUserId" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformInvitation_tokenHash_key" ON "PlatformInvitation"("tokenHash");
CREATE UNIQUE INDEX "PlatformInvitation_acceptedUserId_key" ON "PlatformInvitation"("acceptedUserId");
CREATE INDEX "PlatformInvitation_email_expiresAt_idx" ON "PlatformInvitation"("email", "expiresAt");
ALTER TABLE "AccessApplication" ADD CONSTRAINT "AccessApplication_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "PlatformInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PlatformSubscription" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "plan" TEXT NOT NULL DEFAULT 'Standard',
  "status" "PlatformSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE', "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "renewsAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PlatformSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformSubscription_userId_key" ON "PlatformSubscription"("userId");
CREATE INDEX "PlatformSubscription_status_renewsAt_idx" ON "PlatformSubscription"("status", "renewsAt");
ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformPayment" (
  "id" TEXT NOT NULL, "subscriptionId" TEXT NOT NULL, "amountCents" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TRY', "note" TEXT, "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PlatformPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformPayment_subscriptionId_recordedAt_idx" ON "PlatformPayment"("subscriptionId", "recordedAt");
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PlatformSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "UsageEvent" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "surface" TEXT NOT NULL,
  "model" TEXT NOT NULL, "inputTokens" INTEGER, "outputTokens" INTEGER, "audioInputTokens" INTEGER,
  "audioOutputTokens" INTEGER, "costCents" BIGINT, "pricingVersion" TEXT, "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");
CREATE INDEX "UsageEvent_organizationId_createdAt_idx" ON "UsageEvent"("organizationId", "createdAt");
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Explicit data role; authorization reads this field, never an email string.
UPDATE "User" SET "platformRole" = 'ADMIN' WHERE lower("email") = 'loursane@gmail.com';
