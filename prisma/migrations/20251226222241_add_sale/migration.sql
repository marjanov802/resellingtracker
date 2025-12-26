-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "sku" TEXT,
    "platform" "SellingPlatform" NOT NULL DEFAULT 'OTHER',
    "currency" "Currency" NOT NULL DEFAULT 'GBP',
    "soldAt" TIMESTAMP(3) NOT NULL,
    "quantitySold" INTEGER NOT NULL,
    "salePricePerUnitPence" INTEGER NOT NULL,
    "feesPence" INTEGER NOT NULL DEFAULT 0,
    "netPence" INTEGER NOT NULL DEFAULT 0,
    "costPerUnitPence" INTEGER NOT NULL DEFAULT 0,
    "costTotalPence" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_userId_idx" ON "Sale"("userId");

-- CreateIndex
CREATE INDEX "Sale_userId_soldAt_idx" ON "Sale"("userId", "soldAt");

-- CreateIndex
CREATE INDEX "Sale_userId_itemId_idx" ON "Sale"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
