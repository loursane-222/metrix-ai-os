import type {
  DirectorOpinion,
  DirectorOpinionAction,
  DirectorOpinionConfidence,
  DirectorOpinionEvidence,
  DirectorOpinionRisk,
  DirectorOpinionSignal,
  DirectorOpinionUrgency,
} from "./director-opinion.types";

const URGENCY_RANK: Record<DirectorOpinionUrgency, number> = {
  LOW: 0,
  WATCH: 1,
  IMPORTANT: 2,
  URGENT: 3,
};

const CONFIDENCE_RANK: Record<DirectorOpinionConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export function resolveOpinionUrgency(input: {
  risks: DirectorOpinionRisk[];
  actions: DirectorOpinionAction[];
  fallback?: DirectorOpinionUrgency;
}): DirectorOpinionUrgency {
  return highestUrgency([
    ...(input.risks.map((risk) => risk.severity)),
    ...(input.actions.map((action) => action.urgency)),
    input.fallback ?? "LOW",
  ]);
}

export function resolveOpinionConfidence(input: {
  evidence: DirectorOpinionEvidence[];
  hasCoreSignal: boolean;
  failedSteps?: string[];
}): DirectorOpinionConfidence {
  if ((input.failedSteps ?? []).length > 0) return "LOW";
  if (!input.hasCoreSignal || input.evidence.length <= 1) return "LOW";
  if (input.evidence.length >= 4) return "HIGH";
  return "MEDIUM";
}

export function resolveBundleConfidence(
  opinions: DirectorOpinion[],
): DirectorOpinionConfidence {
  if (opinions.length === 0) return "LOW";
  if (opinions.some((opinion) => opinion.confidence === "LOW")) return "LOW";
  if (opinions.every((opinion) => opinion.confidence === "HIGH")) return "HIGH";
  return "MEDIUM";
}

export function buildTopConcerns(
  opinions: DirectorOpinion[],
  maxItems = 5,
): string[] {
  const concerns = opinions
    .flatMap((opinion) =>
      opinion.risks.map((risk) => ({
        text: `${opinionTitle(opinion)}: ${risk.title}`,
        urgency: risk.severity,
      })),
    )
    .sort((left, right) => URGENCY_RANK[right.urgency] - URGENCY_RANK[left.urgency])
    .map((item) => item.text);

  return unique(concerns).slice(0, maxItems);
}

export function buildCrossFunctionalConflicts(
  opinions: DirectorOpinion[],
): string[] {
  const conflicts: string[] = [];
  const finance = opinions.find((item) => item.directorType === "FINANCE_DIRECTOR");
  const sales = opinions.find((item) => item.directorType === "SALES_DIRECTOR");
  const operations = opinions.find((item) => item.directorType === "OPERATIONS_DIRECTOR");
  const strategy = opinions.find((item) => item.directorType === "STRATEGY_DIRECTOR");

  if (finance?.urgency === "URGENT" && salesHasOpportunity(sales)) {
    conflicts.push(
      "Sales opportunity exists while finance signals urgent cash or collection pressure.",
    );
  }

  if (salesHasOpportunity(sales) && operations?.urgency && isAtLeast(operations.urgency, "IMPORTANT")) {
    conflicts.push(
      "Commercial momentum may need operations capacity and execution discipline before expansion.",
    );
  }

  if (strategy?.urgency === "URGENT" && opinions.some((opinion) => opinion.confidence === "LOW")) {
    conflicts.push(
      "Strategic urgency exists while at least one director has low evidence confidence.",
    );
  }

  return conflicts;
}

export function buildOpinionSummary(input: {
  fallback: string;
  primarySignal?: DirectorOpinionSignal | null;
  primaryRisk?: DirectorOpinionRisk | null;
  primaryOpportunity?: string | null;
  dataQualityNote?: string | null;
}): string {
  if (input.dataQualityNote) return input.dataQualityNote;
  if (input.primaryRisk) return input.primaryRisk.explanation;
  if (input.primarySignal) return input.primarySignal.detail;
  if (input.primaryOpportunity) return input.primaryOpportunity;
  return input.fallback;
}

export function highestUrgency(
  values: DirectorOpinionUrgency[],
): DirectorOpinionUrgency {
  return values.reduce<DirectorOpinionUrgency>(
    (highest, value) =>
      URGENCY_RANK[value] > URGENCY_RANK[highest] ? value : highest,
    "LOW",
  );
}

export function highestConfidence(
  values: DirectorOpinionConfidence[],
): DirectorOpinionConfidence {
  return values.reduce<DirectorOpinionConfidence>(
    (highest, value) =>
      CONFIDENCE_RANK[value] > CONFIDENCE_RANK[highest] ? value : highest,
    "LOW",
  );
}

export function addUnique<T extends { title: string }>(
  items: T[],
  next: T,
  maxItems: number,
): void {
  if (items.length >= maxItems) return;
  const key = next.title.trim().toLocaleLowerCase("tr-TR");
  if (items.some((item) => item.title.trim().toLocaleLowerCase("tr-TR") === key)) {
    return;
  }
  items.push(next);
}

export function addEvidence(
  items: DirectorOpinionEvidence[],
  next: DirectorOpinionEvidence,
  maxItems: number,
): void {
  if (items.length >= maxItems) return;
  const key = `${next.source}:${next.label}:${next.value}`.toLocaleLowerCase("tr-TR");
  if (
    items.some(
      (item) =>
        `${item.source}:${item.label}:${item.value}`.toLocaleLowerCase("tr-TR") ===
        key,
    )
  ) {
    return;
  }
  items.push(next);
}

function salesHasOpportunity(opinion: DirectorOpinion | undefined): boolean {
  return Boolean(opinion && opinion.opportunities.length > 0);
}

function isAtLeast(
  value: DirectorOpinionUrgency,
  minimum: DirectorOpinionUrgency,
): boolean {
  return URGENCY_RANK[value] >= URGENCY_RANK[minimum];
}

function opinionTitle(opinion: DirectorOpinion): string {
  return opinion.opinionTitle || opinion.directorType;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.trim().toLocaleLowerCase("tr-TR");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}
