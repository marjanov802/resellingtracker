/*
  Warnings:

  - You are about to drop the column `purchasePence` on the `Item` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('UNLISTED', 'LISTED', 'SOLD');

-- CreateEnum
CREATE TYPE "SellingPlatform" AS ENUM ('NONE', 'EBAY', 'VINTED', 'DEPOP', 'STOCKX', 'GOAT', 'GRAILED', 'FACEBOOK', 'ETSY', 'OTHER');

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "purchasePence",
ADD COLUMN     "buyerTotalPence" INTEGER,
ADD COLUMN     "listedPricePence" INTEGER,
ADD COLUMN     "paymentProcessingFeePence" INTEGER,
ADD COLUMN     "platform" "SellingPlatform" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "platformFeePence" INTEGER,
ADD COLUMN     "postageChargedToBuyerPence" INTEGER,
ADD COLUMN     "purchaseFeesPence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purchaseShippingPence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purchaseSubtotalPence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "soldAt" TIMESTAMP(3),
ADD COLUMN     "status" "ItemStatus" NOT NULL DEFAULT 'UNLISTED';

-- CreateIndex
CREATE INDEX "Item_userId_status_idx" ON "Item"("userId", "status");
