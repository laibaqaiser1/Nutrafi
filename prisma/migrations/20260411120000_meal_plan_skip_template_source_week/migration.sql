-- Replace single template week (if present) with per-week flags JSON
ALTER TABLE "MealPlan" DROP COLUMN IF EXISTS "weeklySkipTemplateSourceWeek";
ALTER TABLE "MealPlan" ADD COLUMN "weeklySkipApplyTemplateByWeek" JSONB;
