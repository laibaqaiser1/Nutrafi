-- Unused legacy flag; per-week overrides use `weeklySkipDaysByWeek` with fallback to `weeklySkipDays`.
ALTER TABLE "MealPlan" DROP COLUMN IF EXISTS "weeklySkipDaysSameEveryWeek";
