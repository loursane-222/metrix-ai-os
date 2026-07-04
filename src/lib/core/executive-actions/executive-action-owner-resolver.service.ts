import type { ExecutiveActionSourceType } from "./executive-action.types";

export type ResolvedExecutiveActionOwner = {
  ownerType: "USER" | "PERSON" | "UNASSIGNED";
  ownerId: string | null;
};

export type ResolveExecutiveActionOwnerInput = {
  sourceType: ExecutiveActionSourceType;
  orgOwnerUserId: string | null;
  currentUserId?: string | null;
};

const UNASSIGNED: ResolvedExecutiveActionOwner = { ownerType: "UNASSIGNED", ownerId: null };

export function resolveExecutiveActionOwner(
  input: ResolveExecutiveActionOwnerInput,
): ResolvedExecutiveActionOwner {
  switch (input.sourceType) {
    case "EXECUTIVE_PRIORITY":
    case "DAILY_BRIEFING":
    case "MANAGEMENT_REVIEW":
      return toUserOwner(input.orgOwnerUserId);

    case "DECISION":
    case "MANUAL":
      if (input.currentUserId) return { ownerType: "USER", ownerId: input.currentUserId };
      return toUserOwner(input.orgOwnerUserId);

    case "CUSTOMER_SIGNAL":
    case "PERFORMANCE_SIGNAL":
      // PERSON ataması için Person.id gerekir; bu context bridge'de yok. Sonraki faz.
      return UNASSIGNED;
  }
}

function toUserOwner(userId: string | null): ResolvedExecutiveActionOwner {
  if (!userId) return UNASSIGNED;
  return { ownerType: "USER", ownerId: userId };
}
