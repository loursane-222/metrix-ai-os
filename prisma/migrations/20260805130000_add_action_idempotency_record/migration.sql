CREATE TABLE "ActionIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ownerToken" TEXT NOT NULL,
    "resultJson" TEXT,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionIdempotencyRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActionIdempotencyRecord_status_check" CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED'))
);

CREATE UNIQUE INDEX "ActionIdempotencyRecord_scope_key_key"
    ON "ActionIdempotencyRecord"("scope", "key");

CREATE INDEX "ActionIdempotencyRecord_expiresAt_idx"
    ON "ActionIdempotencyRecord"("expiresAt");

CREATE INDEX "ActionIdempotencyRecord_status_expiresAt_idx"
    ON "ActionIdempotencyRecord"("status", "expiresAt");
