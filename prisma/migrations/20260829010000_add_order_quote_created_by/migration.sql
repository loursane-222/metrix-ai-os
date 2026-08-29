-- AlterTable
ALTER TABLE "Order" ADD COLUMN "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Order_organizationId_createdByUserId_idx" ON "Order"("organizationId", "createdByUserId");

-- CreateIndex
CREATE INDEX "Quote_organizationId_createdByUserId_idx" ON "Quote"("organizationId", "createdByUserId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
