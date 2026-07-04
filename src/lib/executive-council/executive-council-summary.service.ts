import type {
  DirectorOpinion,
  DirectorOpinionAction,
  DirectorOpinionRisk,
  DirectorType,
} from "@/lib/director-opinions";
import type {
  ExecutiveCouncilAction,
  ExecutiveCouncilConfidence,
  ExecutiveCouncilEvidence,
  ExecutiveCouncilPosition,
  ExecutiveCouncilStance,
  ExecutiveCouncilUrgency,
} from "./executive-council.types";

const URGENCY_RANK: Record<ExecutiveCouncilUrgency, number> = {
  LOW: 0,
  WATCH: 1,
  IMPORTANT: 2,
  URGENT: 3,
};

const CONFIDENCE_RANK: Record<ExecutiveCouncilConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export function mapCouncilUrgency(
  urgency: DirectorOpinion["urgency"] | DirectorOpinionRisk["severity"] | DirectorOpinionAction["urgency"],
): ExecutiveCouncilUrgency {
  return urgency;
}

export function mapCouncilConfidence(
  confidence: DirectorOpinion["confidence"],
): ExecutiveCouncilConfidence {
  return confidence;
}

export function highestCouncilUrgency(
  values: ExecutiveCouncilUrgency[],
): ExecutiveCouncilUrgency {
  return values.reduce<ExecutiveCouncilUrgency>(
    (highest, value) =>
      URGENCY_RANK[value] > URGENCY_RANK[highest] ? value : highest,
    "LOW",
  );
}

export function resolveCouncilPosition(input: {
  opinions: DirectorOpinion[];
  hasInsufficientData: boolean;
  disagreementsCount: number;
  priorityConflictsCount: number;
}): ExecutiveCouncilPosition {
  if (input.hasInsufficientData || input.opinions.length === 0) return "UNCERTAIN";

  const highestUrgency = highestCouncilUrgency(
    input.opinions.map((opinion) => mapCouncilUrgency(opinion.urgency)),
  );

  if (highestUrgency === "URGENT") return "CRITICAL";
  if (highestUrgency === "IMPORTANT" || input.priorityConflictsCount > 0) return "PRESSURED";
  if (highestUrgency === "WATCH" || input.disagreementsCount > 0) return "WATCHFUL";
  return "STABLE";
}

export function resolveCouncilConfidence(input: {
  opinions: DirectorOpinion[];
  evidence: ExecutiveCouncilEvidence[];
  disagreementsCount: number;
}): ExecutiveCouncilConfidence {
  if (input.opinions.length === 0 || input.evidence.length === 0) return "LOW";
  if (input.opinions.some((opinion) => opinion.confidence === "LOW")) return "LOW";
  if (input.disagreementsCount > 0) return "MEDIUM";
  if (input.opinions.every((opinion) => opinion.confidence === "HIGH")) return "HIGH";
  return "MEDIUM";
}

export function buildRecommendedExecutiveStance(input: {
  position: ExecutiveCouncilPosition;
  highestUrgency: ExecutiveCouncilUrgency;
  topConcern: string | null;
  hasPriorityConflict: boolean;
  hasLowConfidence: boolean;
}): ExecutiveCouncilStance {
  if (input.position === "UNCERTAIN" || input.hasLowConfidence) {
    return {
      position: "UNCERTAIN",
      title: "Proceed with evidence discipline",
      rationale:
        "Council evidence is incomplete or low confidence; the AI General Manager should avoid overcommitting and clarify missing signals first.",
      urgency: input.highestUrgency === "LOW" ? "WATCH" : input.highestUrgency,
    };
  }

  if (input.position === "CRITICAL") {
    return {
      position: "CRITICAL",
      title: "Stabilize the highest-risk management issue first",
      rationale:
        input.topConcern ??
        "At least one director reports urgent pressure that should lead the management stance.",
      urgency: "URGENT",
    };
  }

  if (input.hasPriorityConflict) {
    return {
      position: "PRESSURED",
      title: "Resolve the cross-functional tradeoff before expanding exposure",
      rationale:
        "Director opinions show a priority conflict; the AI General Manager should set the tradeoff explicitly before action.",
      urgency: "IMPORTANT",
    };
  }

  if (input.position === "PRESSURED") {
    return {
      position: "PRESSURED",
      title: "Focus management attention on the pressured area",
      rationale:
        input.topConcern ??
        "Council synthesis indicates important pressure that needs active management attention.",
      urgency: "IMPORTANT",
    };
  }

  if (input.position === "WATCHFUL") {
    return {
      position: "WATCHFUL",
      title: "Keep active watch and avoid unnecessary escalation",
      rationale:
        input.topConcern ??
        "Council synthesis indicates watch-level signals but no urgent stabilization need.",
      urgency: "WATCH",
    };
  }

  return {
    position: "STABLE",
    title: "Maintain current operating discipline",
    rationale:
      "Director opinions do not show a material conflict or urgent risk in the current evidence.",
    urgency: "LOW",
  };
}

export function buildFallbackAction(input: {
  position: ExecutiveCouncilPosition;
  sourceDirectorTypes: DirectorType[];
}): ExecutiveCouncilAction {
  if (input.position === "UNCERTAIN") {
    return {
      title: "Clarify missing director evidence",
      rationale:
        "Council synthesis has insufficient evidence for a high-confidence management stance.",
      urgency: "WATCH",
      sourceDirectorTypes: input.sourceDirectorTypes,
    };
  }

  return {
    title: "Review council synthesis before setting the AI General Manager stance",
    rationale:
      "Council produced synthesis but no repeated director action was strong enough to become a shared action.",
    urgency: "LOW",
    sourceDirectorTypes: input.sourceDirectorTypes,
  };
}

export function normalizeTopic(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length >= 4)
    .slice(0, 6)
    .join(" ");
}

export function isAtLeastUrgency(
  value: ExecutiveCouncilUrgency,
  minimum: ExecutiveCouncilUrgency,
): boolean {
  return URGENCY_RANK[value] >= URGENCY_RANK[minimum];
}

export function sortByUrgencyThenTitle<T extends {
  urgency: ExecutiveCouncilUrgency;
  title: string;
}>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    return (
      URGENCY_RANK[right.urgency] - URGENCY_RANK[left.urgency] ||
      left.title.localeCompare(right.title, "en")
    );
  });
}

export function sortActions(
  actions: ExecutiveCouncilAction[],
): ExecutiveCouncilAction[] {
  return sortByUrgencyThenTitle(actions);
}

export function uniqueDirectorTypes(values: DirectorType[]): DirectorType[] {
  return Array.from(new Set(values));
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase("tr-TR");
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function highestConfidence(
  values: ExecutiveCouncilConfidence[],
): ExecutiveCouncilConfidence {
  return values.reduce<ExecutiveCouncilConfidence>(
    (highest, value) =>
      CONFIDENCE_RANK[value] > CONFIDENCE_RANK[highest] ? value : highest,
    "LOW",
  );
}
