CREATE TYPE "FieldVisitRequestType" AS ENUM ('DISPLAY_REQUEST', 'SAMPLE_REQUEST', 'OTHER');

CREATE TABLE "FieldVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repUserId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerNameRaw" TEXT NOT NULL,
    "contactNameRaw" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "notes" TEXT,
    "requestTypesJson" JSONB,
    "unresolvedIntent" TEXT,
    "relatedOrderId" TEXT,
    "relatedPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FieldVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FieldVisit_organizationId_repUserId_startAt_idx" ON "FieldVisit"("organizationId", "repUserId", "startAt");
CREATE INDEX "FieldVisit_organizationId_customerId_idx" ON "FieldVisit"("organizationId", "customerId");

ALTER TABLE "FieldVisit"
ADD CONSTRAINT "FieldVisit_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FieldVisit"
ADD CONSTRAINT "FieldVisit_repUserId_fkey"
FOREIGN KEY ("repUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FieldVisit"
ADD CONSTRAINT "FieldVisit_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FieldVisit"
ADD CONSTRAINT "FieldVisit_relatedOrderId_fkey"
FOREIGN KEY ("relatedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FieldVisit"
ADD CONSTRAINT "FieldVisit_relatedPaymentId_fkey"
FOREIGN KEY ("relatedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
