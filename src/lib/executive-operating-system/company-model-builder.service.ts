import type { MemoryContext, MemoryContextItem } from "@/lib/memory/memory-context.types";
import type {
  EpistemicType,
  KnowledgeProjection,
  TruthBoundary,
} from "@/lib/executive-knowledge-authority";
import type { CompanyModel, CompanyModelConfidence, CompanyModelFact } from "./company-model.types";
import { EMPTY_COMPANY_MODEL } from "./company-model.types";

type KnowledgePrecedence = "FACT" | "OPINION" | "TEMPORARY";

type CompanyKnowledgeEntry = {
  key: string;
  value: string;
  confidence: number;
  source: CompanyModelFact["source"];
  epistemicType: EpistemicType;
  truthBoundary: TruthBoundary;
  precedence: KnowledgePrecedence;
  order: number;
};

const PRECEDENCE_RANK: Record<KnowledgePrecedence, number> = {
  FACT: 3,
  OPINION: 2,
  TEMPORARY: 1,
};

export function buildCompanyModel(
  memoryContext: MemoryContext | null,
  authorityProjections: readonly KnowledgeProjection[] = [],
): CompanyModel {
  const memoryEntries = memoryContext ? gatherAllItems(memoryContext).map(toMemoryEntry) : [];
  const projectionEntries = authorityProjections
    .filter((projection) => projection.target === "COMPANY_MODEL")
    .map(toProjectionEntry);
  const entries = deduplicateEntries([...memoryEntries, ...projectionEntries])
    .sort(compareEntries);

  if (entries.length === 0) return { ...EMPTY_COMPANY_MODEL };

  const industry = pickValue(entries, ["industry"]);
  const city = pickValue(entries, ["city", "operating_region"]);
  const teamSizeRaw = pickValue(entries, ["team_size", "employee_count"]);
  const teamSize = parseTeamSize(teamSizeRaw);
  const topGoal = pickValue(entries, ["top_goal", "primary_goal", "first_goal"]);
  const cashPriority = pickValue(entries, ["cashflow_priority", "cash_flow_status"]);
  const primaryCustomerType = pickValue(entries, ["primary_customer_type", "customer_type"]);
  const filledCount = [industry, city, teamSizeRaw, topGoal, cashPriority, primaryCustomerType]
    .filter((value) => value !== null).length;

  return {
    industry,
    city,
    teamSize,
    growthPhase: "unknown",
    topGoal,
    cashPriority,
    primaryCustomerType,
    learnedFacts: entries.map(toCompanyModelFact),
    confidence: resolveModelConfidence(filledCount),
  };
}

function gatherAllItems(ctx: MemoryContext): MemoryContextItem[] {
  return [...ctx.facts, ...ctx.processes, ...ctx.strategic, ...ctx.preferences];
}

function toMemoryEntry(item: MemoryContextItem, order: number): CompanyKnowledgeEntry {
  return {
    key: item.key,
    value: item.value,
    confidence: item.confidence,
    source: toFactSource(item.source),
    epistemicType: item.type,
    truthBoundary: item.isUserConfirmed ? "USER_CONFIRMED" : "AUTHORITY_CONFIRMED",
    precedence: "FACT",
    order,
  };
}

function toProjectionEntry(projection: KnowledgeProjection, order: number): CompanyKnowledgeEntry {
  const precedence = resolveProjectionPrecedence(projection);
  return {
    key: projection.key,
    value: projection.value,
    confidence: projection.truthBoundary === "VERIFIED" ? 100 : precedence === "OPINION" ? 60 : 30,
    source: projection.owner === "COMPANY_OPINION" ? "opinion" : "unknown",
    epistemicType: projection.epistemicType,
    truthBoundary: projection.truthBoundary,
    precedence,
    order: 10_000 + order,
  };
}

function resolveProjectionPrecedence(projection: KnowledgeProjection): KnowledgePrecedence {
  if (
    projection.owner === "MEMORY_ITEM" &&
    ["FACT", "PREFERENCE", "PROCESS", "STRATEGIC", "EVENT"].includes(projection.epistemicType) &&
    ["VERIFIED", "USER_CONFIRMED", "AUTHORITY_CONFIRMED"].includes(projection.truthBoundary)
  ) {
    return "FACT";
  }
  if (
    projection.owner === "COMPANY_OPINION" ||
    ["OPINION", "HYPOTHESIS", "BELIEF", "INFERENCE", "ASSUMPTION"].includes(projection.epistemicType)
  ) {
    return "OPINION";
  }
  return "TEMPORARY";
}

function compareEntries(left: CompanyKnowledgeEntry, right: CompanyKnowledgeEntry): number {
  return PRECEDENCE_RANK[right.precedence] - PRECEDENCE_RANK[left.precedence] || left.order - right.order;
}

function deduplicateEntries(entries: CompanyKnowledgeEntry[]): CompanyKnowledgeEntry[] {
  const selected = new Map<string, CompanyKnowledgeEntry>();
  for (const entry of entries.sort(compareEntries)) {
    const identity = `${normalizeValue(entry.key)}:${normalizeValue(entry.value)}`;
    if (!selected.has(identity)) selected.set(identity, entry);
  }
  return [...selected.values()];
}

function pickValue(entries: CompanyKnowledgeEntry[], keys: string[]): string | null {
  const keySet = new Set(keys.map(normalizeKey));
  const found = entries.find((entry) => keySet.has(normalizeKey(entry.key)));
  const trimmed = found?.value.trim();
  return trimmed ? trimmed : null;
}

function parseTeamSize(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toCompanyModelFact(entry: CompanyKnowledgeEntry): CompanyModelFact {
  return {
    key: entry.key,
    value: entry.value,
    confidence: toItemConfidence(entry.confidence),
    source: entry.source,
    epistemicType: entry.epistemicType,
    truthBoundary: entry.truthBoundary,
    isCanonicalFact: entry.precedence === "FACT",
  };
}

function toItemConfidence(raw: number): CompanyModelConfidence {
  const normalized = raw > 1 ? raw / 100 : raw;
  if (normalized >= 0.85) return "high";
  if (normalized >= 0.65) return "medium";
  if (normalized >= 0.3) return "low";
  return "none";
}

function toFactSource(source: string): CompanyModelFact["source"] {
  switch (source) {
    case "ONBOARDING": return "onboarding";
    case "SYSTEM_INFERRED":
    case "EVENT_DERIVED": return "inferred";
    case "USER_CORRECTION":
    case "USER_PROVIDED":
    case "CANDIDATE_APPROVED": return "memory";
    default: return "unknown";
  }
}

function resolveModelConfidence(filledCount: number): CompanyModelConfidence {
  if (filledCount === 0) return "none";
  if (filledCount <= 2) return "low";
  if (filledCount <= 4) return "medium";
  return "high";
}

function normalizeValue(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
