/*
  Warnings:

  - You are about to drop the column `costPence` on the `Item` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('CLOTHING', 'SHOES', 'TECH', 'COLLECTIBLES', 'TRADING_CARDS', 'WATCHES', 'BAGS', 'HOME', 'BOOKS', 'TOYS', 'BEAUTY', 'OTHER');

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "costPence",
ADD COLUMN     "category" "ItemCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'GBP',
ADD COLUMN     "expectedBestPence" INTEGER,
ADD COLUMN     "expectedWorstPence" INTEGER,
ADD COLUMN     "purchasePence" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "quantity" SET DEFAULT 1;

-- CreateIndex
CREATE INDEX "Item_userId_category_idx" ON "Item"("userId", "category");

-- CreateIndex
CREATE INDEX "Item_userId_condition_idx" ON "Item"("userId", "condition");
