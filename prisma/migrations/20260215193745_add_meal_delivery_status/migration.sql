-- AlterTable
ALTER TABLE "MealPlanItem" ADD COLUMN     "isDelivered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MealPlanItem_isDelivered_idx" ON "MealPlanItem"("isDelivered");
