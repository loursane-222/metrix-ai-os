-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "onboardingStep" TEXT DEFAULT 'WELCOME',
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "onboardingStep" TEXT DEFAULT 'WELCOME',
ADD COLUMN "businessProfileJson" JSONB,
ADD COLUMN "recognitionProfileJson" JSONB,
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
