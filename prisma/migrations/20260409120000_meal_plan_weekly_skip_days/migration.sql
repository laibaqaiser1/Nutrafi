-- Recurring skip weekdays (0=Sun … 6=Sat, same as JS Date.getDay). New schedule rows use this when creating days/weeks.
ALTER TABLE "MealPlan" ADD COLUMN "weeklySkipDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
