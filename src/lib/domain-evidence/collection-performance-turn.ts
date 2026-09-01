import type { ManagementIntent } from "@/lib/conversation-understanding";
import type { DomainEvidenceV1 } from "./contracts";

export type CollectionPerformanceTurnFact = Readonly<{
  intent: "COLLECTION_PERFORMANCE";
  period: ManagementIntent["period"];
  label: string;
  start: string;
  endExclusive: string;
  timeZone: string;
  eventCount: number;
  currencies: readonly Readonly<{
    currency: string;
    grossCollections: number;
    reversals: number;
    netCollections: number;
    eventCount: number;
  }>[];
}>;

export function projectCollectionPerformanceTurnFact(
  managementIntent: ManagementIntent | null | undefined,
  records: readonly DomainEvidenceV1[],
): CollectionPerformanceTurnFact | null {
  if (managementIntent?.intent !== "COLLECTION_PERFORMANCE") return null;
  const matching = records.filter((item) =>
    item.evidenceType === "COLLECTION_PERIOD_SUMMARY"
    && item.projection?.periodKind === managementIntent.period,
  );
  if (matching.length === 0) return null;
  const first = matching[0]!.projection!;
  const currencies = matching.flatMap((item) => {
    const projection = item.projection!;
    return typeof projection.currency === "string"
      ? [{
          currency: projection.currency,
          grossCollections: Number(projection.grossCollections),
          reversals: Number(projection.reversals),
          netCollections: Number(projection.netCollections),
          eventCount: Number(projection.eventCount),
        }]
      : [];
  });
  return Object.freeze({
    intent: "COLLECTION_PERFORMANCE",
    period: managementIntent.period,
    label: String(first.periodLabel),
    start: String(first.periodStart),
    endExclusive: String(first.periodEndExclusive),
    timeZone: String(first.timeZone),
    eventCount: currencies.reduce((sum, item) => sum + item.eventCount, 0),
    currencies: Object.freeze(currencies.map((item) => Object.freeze(item))),
  });
}

export function buildCollectionPerformancePromptLine(fact: CollectionPerformanceTurnFact): string {
  return `Authoritative resolved-period collection performance fact (Settlement events only; Payment records are not answer evidence for this intent): ${JSON.stringify(fact)}. The period is already resolved; never ask the user for a date range. eventCount=0 with currencies=[] is affirmative zero-event truth, not missing evidence.`;
}

export function buildCollectionPerformanceResponse(fact: CollectionPerformanceTurnFact): string {
  if (fact.eventCount === 0) return `${fact.label} döneminde gerçekleşmiş tahsilat kaydı bulunmuyor.`;
  const details = fact.currencies.map((item) =>
    `${item.currency}: brüt ${item.grossCollections}, ters kayıt ${item.reversals}, net ${item.netCollections} (${item.eventCount} hareket)`,
  ).join("; ");
  return `${fact.label} tahsilat performansı — ${details}.`;
}
