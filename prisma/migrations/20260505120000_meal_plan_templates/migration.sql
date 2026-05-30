-- CreateTable
CREATE TABLE "MealPlanTemplate" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "planType" "PlanType" NOT NULL,
    "days" INTEGER NOT NULL,
    "mealsPerDay" INTEGER NOT NULL,
    "timeSlots" JSONB,
    "weeklySkipDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanTemplateItem" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "isSkipped" BOOLEAN NOT NULL DEFAULT false,
    "dishId" INTEGER,
    "dishName" TEXT,
    "dishDescription" TEXT,
    "dishCategory" "DishCategory",
    "ingredients" TEXT,
    "allergens" TEXT,
    "calories" INTEGER,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fats" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "customNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanTemplateItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MealPlanTemplateItem_weekday_check" CHECK ("weekday" >= 1 AND "weekday" <= 7)
);

-- CreateIndex
CREATE INDEX "MealPlanTemplate_label_idx" ON "MealPlanTemplate"("label");

-- CreateIndex
CREATE INDEX "MealPlanTemplateItem_templateId_idx" ON "MealPlanTemplateItem"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanTemplateItem_templateId_weekday_slotIndex_key" ON "MealPlanTemplateItem"("templateId", "weekday", "slotIndex");

-- AddForeignKey
ALTER TABLE "MealPlanTemplateItem" ADD CONSTRAINT "MealPlanTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MealPlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanTemplateItem" ADD CONSTRAINT "MealPlanTemplateItem_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
