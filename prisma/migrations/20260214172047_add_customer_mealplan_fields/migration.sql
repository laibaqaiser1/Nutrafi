/*
  Warnings:

  - You are about to drop the column `endDate` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `mealsPerDay` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `planType` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `timeSlots` on the `Customer` table. All the data in the column will be lost.
  - Added the required column `days` to the `MealPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `planType` to the `MealPlan` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Customer_planType_idx";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "endDate",
DROP COLUMN "mealsPerDay",
DROP COLUMN "planType",
DROP COLUMN "startDate",
DROP COLUMN "timeSlots",
ADD COLUMN     "deliveryTime" TEXT;

-- AlterTable
-- First add nullable columns
ALTER TABLE "MealPlan" ADD COLUMN     "averageMealRate" DOUBLE PRECISION,
ADD COLUMN     "baseAmount" DOUBLE PRECISION,
ADD COLUMN     "days" INTEGER,
ADD COLUMN     "planType" "PlanType",
ADD COLUMN     "remainingMeals" INTEGER,
ADD COLUMN     "totalAmount" DOUBLE PRECISION,
ADD COLUMN     "totalMeals" INTEGER,
ADD COLUMN     "vatAmount" DOUBLE PRECISION;

-- Update existing records with default values
UPDATE "MealPlan" SET 
  "planType" = 'WEEKLY' WHERE "planType" IS NULL;
UPDATE "MealPlan" SET 
  "days" = EXTRACT(DAY FROM ("endDate" - "startDate"))::INTEGER + 1 
  WHERE "days" IS NULL;

-- Now make columns required
ALTER TABLE "MealPlan" ALTER COLUMN "days" SET NOT NULL,
ALTER COLUMN "planType" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Customer_fullName_idx" ON "Customer"("fullName");

-- CreateIndex
CREATE INDEX "MealPlan_planType_idx" ON "MealPlan"("planType");
