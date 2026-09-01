import type { ManagementIntent } from "@/lib/conversation-understanding";
import type { DomainEvidenceV1 } from "./contracts";

type ComparisonIntent = Extract<ManagementIntent, { intent: "COLLECTION_COMPARISON" }>;
type PeriodKind = ComparisonIntent["primaryPeriod"] | ComparisonIntent["comparablePeriod"];

export type CollectionComparisonCurrency = Readonly<{
  currency: string;
  primaryGross: number;
  primaryReversals: number;
  primaryNet: number;
  primaryEventCount: number;
  comparableGross: number;
  comparableReversals: number;
  comparableNet: number;
  comparableEventCount: number;
  absoluteDelta: number;
  direction: "UP" | "DOWN" | "UNCHANGED";
  percentageChange: number | null;
}>;

export type CollectionComparisonTurnFact = Readonly<{
  intent: "COLLECTION_COMPARISON";
  primary: Readonly<{ kind: ComparisonIntent["primaryPeriod"]; label: string; start: string; endExclusive: string; timeZone: string; complete: false }>;
  comparable: Readonly<{ kind: ComparisonIntent["comparablePeriod"]; label: string; start: string; endExclusive: string; timeZone: string; complete: true }>;
  comparisonBasis: "PARTIAL_CURRENT_VS_COMPLETE_PREVIOUS";
  currencies: readonly CollectionComparisonCurrency[];
}>;

type PeriodEvidence = Readonly<{
  label: string;
  start: string;
  endExclusive: string;
  timeZone: string;
  values: ReadonlyMap<string, Readonly<{ gross: number; reversals: number; net: number; eventCount: number }>>;
}>;

function projectPeriod(records: readonly DomainEvidenceV1[], kind: PeriodKind): PeriodEvidence | null {
  const matching = records.filter((record) => record.evidenceType === "COLLECTION_PERIOD_SUMMARY" && record.projection?.periodKind === kind);
  if (matching.length === 0) return null;
  const first = matching[0]!.projection!;
  const values = new Map<string, { gross: number; reversals: number; net: number; eventCount: number }>();
  for (const record of matching) {
    const projection = record.projection!;
    if (typeof projection.currency !== "string") continue;
    values.set(projection.currency, {
      gross: Number(projection.grossCollections),
      reversals: Number(projection.reversals),
      net: Number(projection.netCollections),
      eventCount: Number(projection.eventCount),
    });
  }
  return {
    label: String(first.periodLabel),
    start: String(first.periodStart),
    endExclusive: String(first.periodEndExclusive),
    timeZone: String(first.timeZone),
    values,
  };
}

export function projectCollectionComparisonTurnFact(
  managementIntent: ManagementIntent | null | undefined,
  records: readonly DomainEvidenceV1[],
): CollectionComparisonTurnFact | null {
  if (managementIntent?.intent !== "COLLECTION_COMPARISON") return null;
  const primary = projectPeriod(records, managementIntent.primaryPeriod);
  const comparable = projectPeriod(records, managementIntent.comparablePeriod);
  if (!primary || !comparable || primary.timeZone !== comparable.timeZone) return null;

  const currencyCodes = [...new Set([...primary.values.keys(), ...comparable.values.keys()])].sort();
  const currencies = currencyCodes.map((currency): CollectionComparisonCurrency => {
    const current = primary.values.get(currency) ?? { gross: 0, reversals: 0, net: 0, eventCount: 0 };
    const previous = comparable.values.get(currency) ?? { gross: 0, reversals: 0, net: 0, eventCount: 0 };
    const absoluteDelta = Math.round((current.net - previous.net) * 100) / 100;
    return Object.freeze({
      currency,
      primaryGross: current.gross,
      primaryReversals: current.reversals,
      primaryNet: current.net,
      primaryEventCount: current.eventCount,
      comparableGross: previous.gross,
      comparableReversals: previous.reversals,
      comparableNet: previous.net,
      comparableEventCount: previous.eventCount,
      absoluteDelta,
      direction: absoluteDelta > 0 ? "UP" : absoluteDelta < 0 ? "DOWN" : "UNCHANGED",
      percentageChange: previous.net > 0
        ? Math.round((absoluteDelta / previous.net) * 10_000) / 100
        : null,
    });
  });

  return Object.freeze({
    intent: "COLLECTION_COMPARISON",
    primary: Object.freeze({ kind: managementIntent.primaryPeriod, label: primary.label, start: primary.start, endExclusive: primary.endExclusive, timeZone: primary.timeZone, complete: false as const }),
    comparable: Object.freeze({ kind: managementIntent.comparablePeriod, label: comparable.label, start: comparable.start, endExclusive: comparable.endExclusive, timeZone: comparable.timeZone, complete: true as const }),
    comparisonBasis: "PARTIAL_CURRENT_VS_COMPLETE_PREVIOUS",
    currencies: Object.freeze(currencies),
  });
}

function amount(value: number, currency: string): string {
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function buildCollectionComparisonResponse(fact: CollectionComparisonTurnFact): string {
  const scope = `${fact.primary.label} döneminin şu ana kadarki kısmı, tamamlanmış ${fact.comparable.label} dönemiyle karşılaştırıldığında`;
  if (fact.currencies.length === 0) return `${scope} her iki dönemde de gerçekleşmiş tahsilat kaydı bulunmuyor.`;
  const details = fact.currencies.map((item) => {
    const values = `${fact.primary.label}: ${amount(item.primaryNet, item.currency)}, ${fact.comparable.label}: ${amount(item.comparableNet, item.currency)}`;
    if (item.direction === "UNCHANGED") return `${item.currency} tarafında net tahsilat değişmedi (${values})`;
    const direction = item.direction === "UP" ? "daha yüksek" : "daha düşük";
    const percentage = item.percentageChange === null ? "" : ` (%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Math.abs(item.percentageChange))})`;
    return `${item.currency} tarafında net tahsilat ${amount(Math.abs(item.absoluteDelta), item.currency)}${percentage} ${direction} (${values})`;
  });
  return `${scope} ${details.join("; ")}.`;
}

export function buildCollectionComparisonPromptLine(fact: CollectionComparisonTurnFact): string {
  return `Authoritative collection comparison fact (Settlement events only; Payment and legacy financial-health calculations are not answer evidence): ${JSON.stringify(fact)}. Both ranges are resolved in User.timezone and are half-open. Known zero is evidence. A null percentageChange is intentionally not applicable; never invent a percentage or ask for a date range.`;
}
