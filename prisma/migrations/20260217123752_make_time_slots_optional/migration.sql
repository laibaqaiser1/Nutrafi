-- AlterTable: Make timeSlots optional in MealPlan
ALTER TABLE "MealPlan" ALTER COLUMN "timeSlots" DROP NOT NULL;
