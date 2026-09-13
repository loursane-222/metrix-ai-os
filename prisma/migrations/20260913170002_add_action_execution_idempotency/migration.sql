-- CreateEnum
CREATE TYPE "ActionExecutionStatus" AS ENUM ('PENDING', 'VERIFIED');

-- CreateTable
CREATE TABLE "ActionExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" "ActionExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "ActionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionExecution_organizationId_status_idx" ON "ActionExecution"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ActionExecution_resourceType_resourceId_idx" ON "ActionExecution"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionExecution_organizationId_actionType_idempotencyKey_key" ON "ActionExecution"("organizationId", "actionType", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
