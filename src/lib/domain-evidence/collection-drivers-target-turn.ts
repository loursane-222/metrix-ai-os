import type { ManagementIntent } from "@/lib/conversation-understanding";
import type { DomainEvidenceV1 } from "./contracts";

type DriverIntent = Extract<ManagementIntent, { intent: "COLLECTION_DRIVERS" }>;
type TargetIntent = Extract<ManagementIntent, { intent: "COLLECTION_TARGET_POSITION" }>;

type PeriodValue = Readonly<{
  label: string;
  start: string;
  endExclusive: string;
  timeZone: string;
  gross: number;
  reversals: number;
  net: number;
  eventCount: number;
  customers: ReadonlyMap<string, number>;
}>;

export type CollectionCustomerContributionDelta = Readonly<{
  customerName: string;
  attributable: boolean;
  primaryContribution: number;
  comparableContribution: number;
  absoluteDelta: number;
  direction: "INCREASED" | "DECREASED" | "UNCHANGED";
}>;

export type CollectionDriverCurrency = Readonly<{
  currency: string;
  primaryGross: number;
  primaryReversals: number;
  primaryNet: number;
  primaryEventCount: number;
  comparableGross: number;
  comparableReversals: number;
  comparableNet: number;
  comparableEventCount: number;
  grossDelta: number;
  reversalDelta: number;
  netDelta: number;
  direction: "UP" | "DOWN" | "UNCHANGED";
  customerContributions: readonly CollectionCustomerContributionDelta[];
  unattributedDelta: number;
  reconciled: boolean;
}>;

export type CollectionDriversTurnFact = Readonly<{
  intent: "COLLECTION_DRIVERS";
  primary: Readonly<{ kind: DriverIntent["primaryPeriod"]; label: string; start: string; endExclusive: string; timeZone: string }>;
  comparable: Readonly<{ kind: DriverIntent["comparablePeriod"]; label: string; start: string; endExclusive: string; timeZone: string }>;
  comparisonBasis: "PARTIAL_CURRENT_VS_COMPLETE_PREVIOUS";
  currencies: readonly CollectionDriverCurrency[];
  causality: "ARITHMETIC_ATTRIBUTION_ONLY";
}>;

export type CollectionTargetPosition = Readonly<{
  goalId: string;
  title: string;
  currency: string;
  targetAmount: number;
  actualAmount: number;
  absoluteGap: number;
  status: "TARGET_REACHED" | "TARGET_NOT_REACHED";
  attainmentPercentage: number | null;
}>;

export type CollectionTargetTurnFact = Readonly<{
  intent: "COLLECTION_TARGET_POSITION";
  period: Readonly<{ kind: TargetIntent["period"]; label: string; start: string; endExclusive: string; timeZone: string; complete: false }>;
  positions: readonly CollectionTargetPosition[];
  goalStatus: "DEFINED" | "GOAL_NOT_DEFINED";
}>;

const round2 = (value: number) => Math.round(value * 100) / 100;

function projectPeriods(records: readonly DomainEvidenceV1[]): ReadonlyMap<string, ReadonlyMap<string, PeriodValue>> {
  const periods = new Map<string, Map<string, PeriodValue>>();
  for (const record of records) {
    if (record.evidenceType !== "COLLECTION_PERIOD_SUMMARY" || !record.projection) continue;
    const projection = record.projection;
    const kind = String(projection.periodKind);
    const currency = typeof projection.currency === "string" ? projection.currency : null;
    if (!periods.has(kind)) periods.set(kind, new Map());
    if (!currency) continue;
    const customerRows = Array.isArray(projection.customerContributions) ? projection.customerContributions : [];
    const customers = new Map<string, number>();
    for (const item of customerRows) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.customerName === "string" && Number.isFinite(Number(row.netAmount))) customers.set(row.customerName, Number(row.netAmount));
    }
    periods.get(kind)!.set(currency, {
      label: String(projection.periodLabel), start: String(projection.periodStart), endExclusive: String(projection.periodEndExclusive), timeZone: String(projection.timeZone),
      gross: Number(projection.grossCollections), reversals: Number(projection.reversals), net: Number(projection.netCollections), eventCount: Number(projection.eventCount), customers,
    });
  }
  return periods;
}

function periodMetadata(records: readonly DomainEvidenceV1[], kind: string) {
  const record = records.find((item) => item.evidenceType === "COLLECTION_PERIOD_SUMMARY" && item.projection?.periodKind === kind);
  if (!record?.projection) return null;
  return { label: String(record.projection.periodLabel), start: String(record.projection.periodStart), endExclusive: String(record.projection.periodEndExclusive), timeZone: String(record.projection.timeZone) };
}

export function projectCollectionDriversTurnFact(intent: ManagementIntent | null | undefined, records: readonly DomainEvidenceV1[]): CollectionDriversTurnFact | null {
  if (intent?.intent !== "COLLECTION_DRIVERS") return null;
  const metadataPrimary = periodMetadata(records, intent.primaryPeriod);
  const metadataComparable = periodMetadata(records, intent.comparablePeriod);
  if (!metadataPrimary || !metadataComparable || metadataPrimary.timeZone !== metadataComparable.timeZone) return null;
  const periods = projectPeriods(records);
  const primary = periods.get(intent.primaryPeriod) ?? new Map();
  const comparable = periods.get(intent.comparablePeriod) ?? new Map();
  const currencies = [...new Set([...primary.keys(), ...comparable.keys()])].sort().map((currency): CollectionDriverCurrency => {
    const zero = { gross: 0, reversals: 0, net: 0, eventCount: 0, customers: new Map<string, number>() };
    const current = primary.get(currency) ?? zero;
    const previous = comparable.get(currency) ?? zero;
    const grossDelta = round2(current.gross - previous.gross);
    const reversalDelta = round2(current.reversals - previous.reversals);
    const netDelta = round2(current.net - previous.net);
    const names = [...new Set([...current.customers.keys(), ...previous.customers.keys()])];
    const customerContributions = names.map((customerName): CollectionCustomerContributionDelta => {
      const primaryContribution = current.customers.get(customerName) ?? 0;
      const comparableContribution = previous.customers.get(customerName) ?? 0;
      const absoluteDelta = round2(primaryContribution - comparableContribution);
      return Object.freeze({ customerName, attributable: customerName !== "Bilinmeyen müşteri", primaryContribution, comparableContribution, absoluteDelta, direction: absoluteDelta > 0 ? "INCREASED" : absoluteDelta < 0 ? "DECREASED" : "UNCHANGED" });
    }).sort((a, b) => Math.abs(b.absoluteDelta) - Math.abs(a.absoluteDelta) || a.customerName.localeCompare(b.customerName, "tr"));
    const unattributedDelta = round2(customerContributions.filter((item) => !item.attributable).reduce((sum, item) => sum + item.absoluteDelta, 0));
    const customerDelta = round2(customerContributions.reduce((sum, item) => sum + item.absoluteDelta, 0));
    return Object.freeze({ currency, primaryGross: current.gross, primaryReversals: current.reversals, primaryNet: current.net, primaryEventCount: current.eventCount, comparableGross: previous.gross, comparableReversals: previous.reversals, comparableNet: previous.net, comparableEventCount: previous.eventCount, grossDelta, reversalDelta, netDelta, direction: netDelta > 0 ? "UP" : netDelta < 0 ? "DOWN" : "UNCHANGED", customerContributions: Object.freeze(customerContributions), unattributedDelta, reconciled: round2(grossDelta + reversalDelta) === netDelta && customerDelta === netDelta });
  });
  return Object.freeze({ intent: "COLLECTION_DRIVERS", primary: Object.freeze({ kind: intent.primaryPeriod, ...metadataPrimary }), comparable: Object.freeze({ kind: intent.comparablePeriod, ...metadataComparable }), comparisonBasis: "PARTIAL_CURRENT_VS_COMPLETE_PREVIOUS", currencies: Object.freeze(currencies), causality: "ARITHMETIC_ATTRIBUTION_ONLY" });
}

export function projectCollectionTargetTurnFact(intent: ManagementIntent | null | undefined, records: readonly DomainEvidenceV1[]): CollectionTargetTurnFact | null {
  if (intent?.intent !== "COLLECTION_TARGET_POSITION") return null;
  const metadata = periodMetadata(records, intent.period);
  if (!metadata) return null;
  const values = projectPeriods(records).get(intent.period) ?? new Map();
  const positions = records.filter((record) => record.evidenceType === "GOAL_RECORD" && record.projection).flatMap((record): CollectionTargetPosition[] => {
    const projection = record.projection!;
    const targetCents = projection.targetCollectionCents;
    const currency = projection.currency;
    if (projection.goalType !== "COLLECTION" || typeof currency !== "string" || targetCents == null) return [];
    const startsAt = typeof projection.startsAt === "string" ? Date.parse(projection.startsAt) : NaN;
    const endsAt = typeof projection.endsAt === "string" ? Date.parse(projection.endsAt) : NaN;
    if (projection.period !== "MONTHLY" || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt > Date.parse(metadata.start) || endsAt < Date.parse(metadata.endExclusive)) return [];
    const targetAmount = Number(String(targetCents)) / 100;
    const actualAmount = values.get(currency)?.net ?? 0;
    const absoluteGap = round2(targetAmount - actualAmount);
    return [Object.freeze({ goalId: record.sourceRecordId, title: String(projection.title), currency, targetAmount, actualAmount, absoluteGap, status: absoluteGap <= 0 ? "TARGET_REACHED" : "TARGET_NOT_REACHED", attainmentPercentage: targetAmount > 0 ? round2((actualAmount / targetAmount) * 100) : null })];
  });
  return Object.freeze({ intent: "COLLECTION_TARGET_POSITION", period: Object.freeze({ kind: intent.period, ...metadata, complete: false as const }), positions: Object.freeze(positions), goalStatus: positions.length ? "DEFINED" : "GOAL_NOT_DEFINED" });
}

function amount(value: number, currency: string) { return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} ${currency}`; }
function percentage(value: number) { return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value); }

export function buildCollectionDriversResponse(fact: CollectionDriversTurnFact): string {
  if (!fact.currencies.length) return `${fact.primary.label} döneminin şu ana kadarki kısmı ile ${fact.comparable.label} karşılaştırıldığında iki dönemde de tahsilat hareketi bulunmuyor; bu nedenle hesaplanabilir bir değişim bileşeni yok.`;
  return fact.currencies.map((item) => {
    const direction = item.direction === "UP" ? "arttı" : item.direction === "DOWN" ? "azaldı" : "değişmedi";
    const components = [`brüt tahsilat farkı ${amount(item.grossDelta, item.currency)}`, `ters kayıt etkisi farkı ${amount(item.reversalDelta, item.currency)}`];
    const relevant = item.customerContributions.filter((customer) => customer.attributable && customer.direction !== "UNCHANGED" && (item.direction === "DOWN" ? customer.absoluteDelta < 0 : item.direction === "UP" ? customer.absoluteDelta > 0 : true)).slice(0, 3);
    const customers = relevant.length ? ` En büyük müşteri katkı değişimleri: ${relevant.map((customer) => `${customer.customerName} ${amount(customer.absoluteDelta, item.currency)}`).join(", ")}.` : "";
    const unattributed = item.unattributedDelta !== 0 ? ` Müşteriye atanamayan değişim: ${amount(item.unattributedDelta, item.currency)}.` : "";
    return `${item.currency} tarafında net tahsilat ${amount(Math.abs(item.netDelta), item.currency)} ${direction}; ${components.join(", ")}.${customers}${unattributed} Bunlar hesaplanabilir finansal katkılardır; operasyonel neden kanıtlanmış değildir.`;
  }).join("\n");
}

export function buildCollectionTargetResponse(fact: CollectionTargetTurnFact): string {
  if (fact.goalStatus === "GOAL_NOT_DEFINED") return `${fact.period.label} için karşılaştırılabilir bir tahsilat hedefi tanımlı değil.`;
  return fact.positions.map((item) => item.status === "TARGET_REACHED"
    ? `${item.title}: ${amount(item.actualAmount, item.currency)} tahsilatla ${amount(item.targetAmount, item.currency)} hedefe ulaşıldı${item.attainmentPercentage === null ? "" : ` (%${percentage(item.attainmentPercentage)})`}.`
    : `${item.title}: şu ana kadar ${amount(item.actualAmount, item.currency)} tahsil edildi; ${amount(item.targetAmount, item.currency)} hedefe ulaşmak için ${amount(item.absoluteGap, item.currency)} daha gerekiyor${item.attainmentPercentage === null ? "" : ` (hedefin %${percentage(item.attainmentPercentage)}'i)`}.`).join("\n");
}

export function buildCollectionDriversPromptLine(fact: CollectionDriversTurnFact) { return `Authoritative arithmetic collection drivers (Settlement only; never infer operational causality): ${JSON.stringify(fact)}.`; }
export function buildCollectionTargetPromptLine(fact: CollectionTargetTurnFact) { return `Authoritative collection target position (Settlement actual; exact currency; missing goal is not zero): ${JSON.stringify(fact)}.`; }
