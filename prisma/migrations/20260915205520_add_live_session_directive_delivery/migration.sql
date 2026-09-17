-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "directiveIssuedAt" TIMESTAMP(3),
ADD COLUMN     "directiveJson" TEXT,
ADD COLUMN     "directiveVersion" INTEGER NOT NULL DEFAULT 0;
