import { listCollectionEventsInRange, type SettlementCollectionEvent } from "@/lib/core/settlements/settlement.service";
import type { ResolvedPeriod } from "../date-ranges";

// The single canonical structured dataset for a collections (tahsilat)
// export — one row per real Settlement event (the proven canonical
// collection-event authority; see settlement.repository.ts's
// listSettlementsForOrganizationInRange), reused unchanged by both the
// XLSX renderer and METRIX's narration. Neither ever recomputes rows or
// totals independently — this is what "Artifact Truth" means structurally.
//
// Deliberately NOT built from Payment.paidAt/paidAmount: those are a
// cumulative settlement-status rollup (paidAt only set once a Payment is
// FULLY settled, paidAmount is a running total across possibly many dates)
// — proven, from settlement.service.ts's own write logic, to silently drop
// every partial collection from period exports and misattribute a
// multi-date collection history to a single final date. A Settlement is
// the real, immutable, per-event record of "we received/reversed X on date
// Z" (see settlement.repository.ts's own comment).
export type CollectionRecordRow = Readonly<{
  occurredAt: Date;
  customerName: string;
  title: string;
  // Signed: positive for an ORIGINAL (direction IN) collection, negative
  // for a REVERSAL (direction OUT) — the literal, unmodified accounting
  // effect already recorded by settlement.service.ts, not a reinvented
  // export-only convention.
  amount: number;
  currency: string;
  invoiceNumber: string | null;
  kind: "ORIGINAL" | "REVERSAL";
}>;

export type CollectionsDataset = Readonly<{
  period: ResolvedPeriod;
  records: readonly CollectionRecordRow[];
  recordCount: number;
  // Grouped by currency — a report never silently sums TRY and USD rows
  // into one meaningless number. Each total is the net of that currency's
  // ORIGINAL and REVERSAL events in this period — a reversal already
  // subtracts itself out; it is never subtracted a second time anywhere
  // else in this pipeline.
  totalsByCurrency: Readonly<Record<string, number>>;
}>;

function toRow(event: SettlementCollectionEvent): CollectionRecordRow {
  const signedAmount = event.direction === "IN" ? Number(event.amount) : -Number(event.amount);
  return {
    occurredAt: event.occurredAt,
    customerName: event.payment.customer?.displayName ?? "Bilinmeyen müşteri",
    title: event.payment.title,
    amount: signedAmount,
    currency: event.currency,
    invoiceNumber: event.payment.invoice?.invoiceNumber ?? null,
    kind: event.kind,
  };
}

export async function buildCollectionsDataset(
  organizationId: string,
  period: ResolvedPeriod,
): Promise<CollectionsDataset> {
  const events = await listCollectionEventsInRange(organizationId, { from: period.from, to: period.to });
  const records = events.map(toRow);
  const totalsByCurrency: Record<string, number> = {};
  for (const record of records) {
    totalsByCurrency[record.currency] = Math.round(((totalsByCurrency[record.currency] ?? 0) + record.amount) * 100) / 100;
  }
  return Object.freeze({
    period,
    records: Object.freeze(records),
    recordCount: records.length,
    totalsByCurrency: Object.freeze(totalsByCurrency),
  });
}
