-- AlterTable
ALTER TABLE "User"
ADD COLUMN     "notifyCritical" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyDeliverySince" TIMESTAMP(3),
ADD COLUMN     "notifyFinance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyMuteAll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifySales" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyTasks" BOOLEAN NOT NULL DEFAULT true;
