-- Additive closeout: raw measured usage and canonical platform notices.
ALTER TABLE "UsageEvent" ADD COLUMN "cachedInputTokens" INTEGER;
ALTER TABLE "UsageEvent" ADD COLUMN "reasoningTokens" INTEGER;
ALTER TABLE "UsageEvent" ADD COLUMN "liveSeconds" INTEGER;
ALTER TABLE "UsageEvent" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
CREATE UNIQUE INDEX "UsageEvent_requestId_key" ON "UsageEvent"("requestId");

ALTER TABLE "Notification" ALTER COLUMN "organizationId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "platformIdempotencyKey" TEXT;
CREATE UNIQUE INDEX "Notification_platformIdempotencyKey_key" ON "Notification"("platformIdempotencyKey");
