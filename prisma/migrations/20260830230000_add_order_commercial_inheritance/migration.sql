-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "generalDiscountBasisPoints" INTEGER,
ADD COLUMN     "deliveryTerm" TEXT,
ADD COLUMN     "deliveryMethod" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discountBasisPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatRateBasisPoints" INTEGER NOT NULL DEFAULT 0;
