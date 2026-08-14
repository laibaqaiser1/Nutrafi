-- CreateTable
CREATE TABLE "MealPlanHistory" (
    "id" SERIAL NOT NULL,
    "mealPlanId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "itemId" INTEGER,
    "actorUserId" INTEGER,
    "requestId" TEXT,
    "details" JSONB,
    "totalMeals" INTEGER,
    "remainingMeals" INTEGER,
    "days" INTEGER,
    "mealsPerDay" INTEGER,
    "activeCount" INTEGER NOT NULL DEFAULT 0,
    "inactiveCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "wrongDeliveryCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledCount" INTEGER NOT NULL DEFAULT 0,
    "remainingBefore" INTEGER,
    "remainingAfter" INTEGER,
    "deliveredBefore" INTEGER,
    "deliveredAfter" INTEGER,
    "activeBefore" INTEGER,
    "activeAfter" INTEGER,
    "inactiveBefore" INTEGER,
    "inactiveAfter" INTEGER,

    CONSTRAINT "MealPlanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealPlanHistory_mealPlanId_createdAt_idx" ON "MealPlanHistory"("mealPlanId", "createdAt");

-- CreateIndex
CREATE INDEX "MealPlanHistory_action_createdAt_idx" ON "MealPlanHistory"("action", "createdAt");

-- CreateIndex
CREATE INDEX "MealPlanHistory_requestId_idx" ON "MealPlanHistory"("requestId");

-- AddForeignKey
ALTER TABLE "MealPlanHistory" ADD CONSTRAINT "MealPlanHistory_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
