import type { FirstExperienceOpeningPlan, FirstExperienceState } from "./first-experience.types";
import { FIRST_EXPERIENCE_MESSAGE_KIND } from "./first-experience.types";

export function shouldDeliverOpening(state: FirstExperienceState): boolean {
  return state.membershipRole === "OWNER" && state.organizationStatus === "NOT_STARTED";
}

export function isFirstExperienceActive(state: FirstExperienceState): boolean {
  return state.organizationStatus === "IN_PROGRESS";
}

export function shouldCompleteAfterNormalTurn(state: FirstExperienceState): boolean {
  return state.organizationStatus === "IN_PROGRESS";
}

export function buildFirstExperienceOpeningPlan(displayName?: string | null): FirstExperienceOpeningPlan {
  const greeting = displayName?.trim() ? `Hoş geldiniz ${displayName.trim()}.` : "Hoş geldiniz.";
  return {
    title: "Metrix ile ilk görüşme",
    content: `${greeting} Ben Metrix, şirketinizin operasyonlarını sizinle birlikte yöneten AI Genel Müdürüyüm. Bana şirketinizi ve şu anda en çok kontrol altında tutmak istediğiniz konuyu kendi cümlelerinizle anlatın; ilk odağımızı birlikte netleştirelim.`,
    metadata: { kind: FIRST_EXPERIENCE_MESSAGE_KIND, version: 1 },
  };
}
