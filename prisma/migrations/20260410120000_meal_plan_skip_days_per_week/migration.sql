ALTER TABLE "MealPlan" ADD COLUMN "weeklySkipDaysSameEveryWeek" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MealPlan" ADD COLUMN "weeklySkipDaysByWeek" JSONB;
