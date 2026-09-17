-- AlterTable
ALTER TABLE "LiveDiagnosticEvent" ADD COLUMN     "errorCategory" TEXT,
ADD COLUMN     "errorClass" TEXT,
ADD COLUMN     "errorStatus" INTEGER;
