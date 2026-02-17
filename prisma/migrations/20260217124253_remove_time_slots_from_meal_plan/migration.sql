-- Remove timeSlots column from MealPlan (not needed, delivery times stored per meal item)
ALTER TABLE "MealPlan" DROP COLUMN IF EXISTS "timeSlots";
