-- Plan default skip days live on `weeklySkipDays` (edit meal plan); per-week overrides stay in `weeklySkipDaysByWeek`.
ALTER TABLE "MealPlan" DROP COLUMN IF EXISTS "weeklySkipApplyTemplateByWeek";
