import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { FIRST_EXPERIENCE_ACTIVE, FIRST_EXPERIENCE_MESSAGE_KIND, FIRST_EXPERIENCE_WELCOME_DELIVERED } from "./first-experience.types";

export async function claimFirstExperienceOpening(organizationId: string, tx: PrismaTransactionClient): Promise<boolean> {
  const result = await tx.organization.updateMany({
    where: { id: organizationId, onboardingStatus: "NOT_STARTED" },
    data: { onboardingStatus: "IN_PROGRESS", onboardingStep: FIRST_EXPERIENCE_WELCOME_DELIVERED },
  });
  return result.count === 1;
}

export async function findOpeningConversation(organizationId: string, userId: string, tx: PrismaTransactionClient = prisma) {
  return tx.conversation.findFirst({
    where: {
      organizationId,
      createdBy: userId,
      type: "GENERAL",
      messages: { some: { senderType: "AI", metadata: { path: ["kind"], equals: FIRST_EXPERIENCE_MESSAGE_KIND } } },
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function completeFirstExperienceCompatibility(organizationId: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.organization.updateMany({
      where: { id: organizationId, onboardingStatus: "IN_PROGRESS" },
      data: { onboardingStatus: "COMPLETED", onboardingStep: FIRST_EXPERIENCE_ACTIVE, onboardingCompletedAt: new Date() },
    });
    if (updated.count === 0) return;
    await tx.user.updateMany({
      where: { id: userId },
      data: { onboardingStatus: "COMPLETED", onboardingStep: FIRST_EXPERIENCE_ACTIVE, onboardingCompletedAt: new Date() },
    });
  });
}
