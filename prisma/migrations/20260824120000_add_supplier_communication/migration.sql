-- AlterEnum
ALTER TYPE "CommunicationType" ADD VALUE 'SUPPLIER_MESSAGE';
ALTER TYPE "CommunicationAudienceType" ADD VALUE 'SUPPLIER';

-- AlterTable
ALTER TABLE "ExecutiveCommunication" ADD COLUMN "supplierId" TEXT;
CREATE INDEX "ExecutiveCommunication_organizationId_supplierId_idx" ON "ExecutiveCommunication"("organizationId", "supplierId");
ALTER TABLE "ExecutiveCommunication" ADD CONSTRAINT "ExecutiveCommunication_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
