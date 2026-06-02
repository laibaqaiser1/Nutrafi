-- AlterTable
ALTER TABLE "CustomerLocation" ADD COLUMN "icon" TEXT NOT NULL DEFAULT 'home';

-- Backfill icons from labels where possible
UPDATE "CustomerLocation" SET "icon" = 'home' WHERE LOWER("label") = 'home';
UPDATE "CustomerLocation" SET "icon" = 'work' WHERE LOWER("label") IN ('work', 'office');
UPDATE "CustomerLocation" SET "icon" = 'pin' WHERE LOWER("label") = 'other';
