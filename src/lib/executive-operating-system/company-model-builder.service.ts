import type { MemoryContext, MemoryContextItem } from "@/lib/memory/memory-context.types";
import type { CompanyModel, CompanyModelConfidence, CompanyModelFact } from "./company-model.types";
import { EMPTY_COMPANY_MODEL } from "./company-model.types";

export function buildCompanyModel(memoryContext: MemoryContext | null): CompanyModel {
  if (!memoryContext) {
    return { ...EMPTY_COMPANY_MODEL };
  }

  const allItems = gatherAllItems(memoryContext);

  const industry = pickValue(allItems, ["industry"]);
  const city = pickValue(allItems, ["city", "operating_region"]);
  const teamSizeRaw = pickValue(allItems, ["team_size", "employee_count"]);
  const teamSize = parseTeamSize(teamSizeRaw);
  const topGoal = pickValue(allItems, ["top_goal", "primary_goal", "first_goal"]);
  const cashPriority = pickValue(allItems, ["cashflow_priority", "cash_flow_status"]);
  const primaryCustomerType = pickValue(allItems, ["primary_customer_type", "customer_type"]);
  const learnedFacts = allItems.map(toCompanyModelFact);

  const filledCount = [industry, city, teamSizeRaw, topGoal, cashPriority, primaryCustomerType].filter(
    (v) => v !== null,
  ).length;

  return {
    industry,
    city,
    teamSize,
    growthPhase: "unknown",
    topGoal,
    cashPriority,
    primaryCustomerType,
    learnedFacts,
    confidence: resolveModelConfidence(filledCount),
  };
}

function gatherAllItems(ctx: MemoryContext): MemoryContextItem[] {
  return [...ctx.facts, ...ctx.processes, ...ctx.strategic, ...ctx.preferences];
}

function pickValue(items: MemoryContextItem[], keys: string[]): string | null {
  const keySet = new Set(keys.map((k) => k.toLowerCase()));
  const found = items.find((item) => keySet.has(item.key.toLowerCase()));
  const trimmed = found?.value.trim();
  return trimmed ? trimmed : null;
}

function parseTeamSize(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toCompanyModelFact(item: MemoryContextItem): CompanyModelFact {
  return {
    key: item.key,
    value: item.value,
    confidence: toItemConfidence(item.confidence),
    source: toFactSource(item.source),
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
    case "ONBOARDING":
      return "onboarding";
    case "SYSTEM_INFERRED":
    case "EVENT_DERIVED":
      return "inferred";
    case "USER_CORRECTION":
    case "USER_PROVIDED":
    case "CANDIDATE_APPROVED":
      return "memory";
    default:
      return "unknown";
  }
}

function resolveModelConfidence(filledCount: number): CompanyModelConfidence {
  if (filledCount === 0) return "none";
  if (filledCount <= 2) return "low";
  if (filledCount <= 4) return "medium";
  return "high";
}
