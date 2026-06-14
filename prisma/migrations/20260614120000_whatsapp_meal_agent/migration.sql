-- WhatsApp meal agent: runs, actions, pending state, conversation agent mode

CREATE TYPE "WhatsAppAgentMode" AS ENUM ('AUTO', 'MANUAL');

CREATE TYPE "WhatsAppAgentTrigger" AS ENUM ('INBOUND_MESSAGE', 'CRON_REMINDER', 'MANUAL');

CREATE TYPE "WhatsAppAgentRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'NEEDS_CONFIRMATION', 'SKIPPED');

CREATE TYPE "WhatsAppPendingActionStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED', 'EXPIRED');

CREATE TYPE "WhatsAppPendingActionType" AS ENUM ('DISH_CHOICE', 'MEAL_BATCH', 'REPLACE_MEAL');

ALTER TABLE "WhatsAppConversation" ADD COLUMN "agentMode" "WhatsAppAgentMode" NOT NULL DEFAULT 'AUTO';

CREATE TABLE "WhatsAppAgentRun" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER,
    "customerId" INTEGER,
    "mealPlanId" INTEGER,
    "inboundMessageId" INTEGER,
    "parentRunId" INTEGER,
    "pendingActionId" INTEGER,
    "trigger" "WhatsAppAgentTrigger" NOT NULL,
    "status" "WhatsAppAgentRunStatus" NOT NULL,
    "rawMessageBody" TEXT,
    "parsedIntent" JSONB,
    "model" TEXT,
    "modelRawResponse" JSONB,
    "errorMessage" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppAgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppAgentAction" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "confidence" DOUBLE PRECISION,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppAgentAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppPendingAction" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "mealPlanId" INTEGER,
    "createdFromRunId" INTEGER,
    "type" "WhatsAppPendingActionType" NOT NULL,
    "status" "WhatsAppPendingActionStatus" NOT NULL DEFAULT 'OPEN',
    "context" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppPendingAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppAgentRun_conversationId_idx" ON "WhatsAppAgentRun"("conversationId");
CREATE INDEX "WhatsAppAgentRun_customerId_idx" ON "WhatsAppAgentRun"("customerId");
CREATE INDEX "WhatsAppAgentRun_mealPlanId_idx" ON "WhatsAppAgentRun"("mealPlanId");
CREATE INDEX "WhatsAppAgentRun_inboundMessageId_idx" ON "WhatsAppAgentRun"("inboundMessageId");
CREATE INDEX "WhatsAppAgentRun_status_idx" ON "WhatsAppAgentRun"("status");
CREATE INDEX "WhatsAppAgentRun_createdAt_idx" ON "WhatsAppAgentRun"("createdAt");

CREATE INDEX "WhatsAppAgentAction_runId_idx" ON "WhatsAppAgentAction"("runId");
CREATE INDEX "WhatsAppAgentAction_actionType_idx" ON "WhatsAppAgentAction"("actionType");

CREATE INDEX "WhatsAppPendingAction_conversationId_idx" ON "WhatsAppPendingAction"("conversationId");
CREATE INDEX "WhatsAppPendingAction_status_idx" ON "WhatsAppPendingAction"("status");
CREATE INDEX "WhatsAppPendingAction_expiresAt_idx" ON "WhatsAppPendingAction"("expiresAt");

ALTER TABLE "WhatsAppAgentRun" ADD CONSTRAINT "WhatsAppAgentRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAgentRun" ADD CONSTRAINT "WhatsAppAgentRun_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAgentRun" ADD CONSTRAINT "WhatsAppAgentRun_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAgentRun" ADD CONSTRAINT "WhatsAppAgentRun_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "WhatsAppMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAgentRun" ADD CONSTRAINT "WhatsAppAgentRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "WhatsAppAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAgentRun" ADD CONSTRAINT "WhatsAppAgentRun_pendingActionId_fkey" FOREIGN KEY ("pendingActionId") REFERENCES "WhatsAppPendingAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppAgentAction" ADD CONSTRAINT "WhatsAppAgentAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WhatsAppAgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppPendingAction" ADD CONSTRAINT "WhatsAppPendingAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppPendingAction" ADD CONSTRAINT "WhatsAppPendingAction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppPendingAction" ADD CONSTRAINT "WhatsAppPendingAction_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
