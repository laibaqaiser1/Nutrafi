-- Catalog plans: persist total meal slots (days × meals per day).
ALTER TABLE "Plan" ADD COLUMN "totalMeals" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan" SET "totalMeals" = days * "mealsPerDay";
