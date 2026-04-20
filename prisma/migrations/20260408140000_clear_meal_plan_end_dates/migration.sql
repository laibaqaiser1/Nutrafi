-- Clear end date on every meal plan (column and index stay; app can ignore endDate until you drop it later).
UPDATE "MealPlan" SET "endDate" = NULL WHERE "endDate" IS NOT NULL;
