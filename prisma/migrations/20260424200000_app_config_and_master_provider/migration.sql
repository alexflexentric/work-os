-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "googleClientId" TEXT,
    "googleClientSecret" TEXT,
    "microsoftClientId" TEXT,
    "microsoftClientSecret" TEXT,
    "microsoftTenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- AlterTable UserSettings: add new columns
ALTER TABLE "UserSettings"
    ADD COLUMN IF NOT EXISTS "masterCalendarProvider" TEXT NOT NULL DEFAULT 'google',
    ADD COLUMN IF NOT EXISTS "calendarId" TEXT;

-- AlterTable UserSettings: drop old Microsoft credential columns
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "microsoftClientId";
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "microsoftClientSecret";
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "microsoftTenantId";
