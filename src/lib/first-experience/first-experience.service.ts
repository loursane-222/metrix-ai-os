import { prisma } from "@/lib/core/shared/prisma";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { buildFirstExperienceOpeningPlan, shouldCompleteAfterNormalTurn, shouldDeliverOpening } from "./first-experience.policy";
import { claimFirstExperienceOpening, completeFirstExperienceCompatibility, findOpeningConversation } from "./first-experience.repository";
import type { FirstExperienceBootstrap, FirstExperienceState } from "./first-experience.types";

function stateFromAuth(auth: AuthContext): FirstExperienceState {
  return { organizationStatus: auth.organization.onboardingStatus, organizationStep: auth.organization.onboardingStep, membershipRole: auth.membership.role };
}

export async function bootstrapFirstExperience(auth: AuthContext): Promise<FirstExperienceBootstrap> {
  const state = stateFromAuth(auth);
  if (shouldDeliverOpening(state)) {
    await prisma.$transaction(async (tx) => {
      const claimed = await claimFirstExperienceOpening(auth.organization.id, tx);
      if (!claimed) return;
      const plan = buildFirstExperienceOpeningPlan(auth.user.fullName);
      const conversation = await tx.conversation.create({ data: { organizationId: auth.organization.id, createdBy: auth.user.id, title: plan.title, type: "GENERAL", status: "OPEN" } });
      await tx.message.create({ data: { conversationId: conversation.id, senderType: "AI", content: plan.content, metadata: plan.metadata } });
      await tx.user.updateMany({ where: { id: auth.user.id, onboardingStatus: "NOT_STARTED" }, data: { onboardingStatus: "IN_PROGRESS", onboardingStep: "FIRST_EXPERIENCE_WELCOME_DELIVERED" } });
    });
  }

  const conversation = await findOpeningConversation(auth.organization.id, auth.user.id);
  return {
    active: state.organizationStatus !== "COMPLETED" || Boolean(conversation),
    conversationId: conversation?.id ?? null,
    messages: conversation?.messages.map((message) => ({ role: message.senderType === "USER" ? "user" : "metrix", content: message.content })) ?? [],
  };
}

export function completeFirstExperienceAfterNormalTurn(auth: AuthContext): void {
  if (!shouldCompleteAfterNormalTurn(stateFromAuth(auth))) return;
  void completeFirstExperienceCompatibility(auth.organization.id, auth.user.id).catch((error: unknown) => {
    console.warn("[FirstExperience] compatibility completion failed:", error);
  });
}
