-- AlterTable
ALTER TABLE "MealPlanItem" ADD COLUMN "customerLocationId" INTEGER;

-- CreateIndex
CREATE INDEX "MealPlanItem_customerLocationId_idx" ON "MealPlanItem"("customerLocationId");

-- AddForeignKey
ALTER TABLE "MealPlanItem" ADD CONSTRAINT "MealPlanItem_customerLocationId_fkey" FOREIGN KEY ("customerLocationId") REFERENCES "CustomerLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
