import { prisma } from "@/lib/core/shared/prisma";
import type { ConversationTurnArtifact } from "@/lib/conversations/conversation-turn-artifact";

export type CanonicalBusinessFactEntity =
  | "customers"
  | "products"
  | "quotes"
  | "invoices"
  | "payments"
  | "expenses"
  | "tasks"
  | "people";

export type CanonicalBusinessFacts = Readonly<{
  entity: CanonicalBusinessFactEntity;
  model: "Customer" | "ProductService" | "Quote" | "Invoice" | "Payment" | "Expense" | "Task" | "Person";
  count: number;
  records: readonly Readonly<Record<string, string | null>>[];
}>;

// Exported for canonical-contradiction-guard.ts — the same "does this text
// mention entity X" test used to detect what to fetch is reused there to
// detect what to fact-check against.
export const ENTITY_PATTERNS: readonly [CanonicalBusinessFactEntity, RegExp][] = [
  ["customers", /(müşteri|musteri|customer)/u],
  ["products", /(ürün|urun|hizmet|product|service)/u],
  ["quotes", /(teklif|offer|quote)/u],
  ["invoices", /(fatura|invoice)/u],
  ["payments", /(tahsilat|ödeme|odeme|payment)/u],
  ["expenses", /(gider|masraf|expense)/u],
  ["tasks", /(görev|gorev|task)/u],
  ["people", /(kişi|kisi|personel|çalışan|calisan|people|person)/u],
];

export function detectCanonicalBusinessFactEntities(message: string): CanonicalBusinessFactEntity[] {
  const normalized = message.toLocaleLowerCase("tr-TR");
  return ENTITY_PATTERNS
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([entity]) => entity);
}

/** A list/detail request deserves an inline workspace; a bare total does not. */
export function isCanonicalBusinessFactListRequest(message: string): boolean {
  const normalized = message.toLocaleLowerCase("tr-TR").trim();
  if (/\bkaç\s+(tane|adet|müşteri|musteri|ürün|urun|görev|gorev|fatura|ödeme|odeme)\b/u.test(normalized)) return false;
  return /\b(kim|hangileri|liste|listesi|isim|isimleri|adları|adlarini|detay|detayları|detaylari|göster|goster|ver)\b/u.test(normalized);
}

export async function readCanonicalBusinessFactsForMessage(input: {
  organizationId: string;
  message: string;
}): Promise<readonly CanonicalBusinessFacts[]> {
  const entities = detectCanonicalBusinessFactEntities(input.message);
  return Promise.all(entities.map((entity) => readEntityFacts(input.organizationId, entity)));
}

async function readEntityFacts(
  organizationId: string,
  entity: CanonicalBusinessFactEntity,
): Promise<CanonicalBusinessFacts> {
  if (entity === "customers") {
    const [count, records] = await Promise.all([
      prisma.customer.count({ where: { organizationId, status: "ACTIVE" as const } }),
      prisma.customer.findMany({ where: { organizationId, status: "ACTIVE" as const }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, legalName: true, status: true } }),
    ]);
    return facts(entity, "Customer", count, records.map((row) => ({ id: row.id, name: row.displayName, legalName: row.legalName, status: row.status })));
  }
  if (entity === "products") {
    const [count, records] = await Promise.all([
      prisma.productService.count({ where: { organizationId } }),
      prisma.productService.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true, category: true, status: true } }),
    ]);
    return facts(entity, "ProductService", count, records.map((row) => ({ id: row.id, name: row.name, type: row.type, category: row.category, status: row.status })));
  }
  if (entity === "quotes") {
    const [count, records] = await Promise.all([
      prisma.quote.count({ where: { organizationId } }),
      prisma.quote.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, customerName: true, status: true } }),
    ]);
    return facts(entity, "Quote", count, records.map((row) => ({ id: row.id, title: row.title, customerName: row.customerName, status: row.status })));
  }
  if (entity === "invoices") {
    const [count, records] = await Promise.all([
      prisma.invoice.count({ where: { organizationId } }),
      prisma.invoice.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { id: true, invoiceNumber: true, title: true, status: true } }),
    ]);
    return facts(entity, "Invoice", count, records.map((row) => ({ id: row.id, invoiceNumber: row.invoiceNumber, title: row.title, status: row.status })));
  }
  if (entity === "payments") {
    const [count, records] = await Promise.all([
      prisma.payment.count({ where: { organizationId } }),
      prisma.payment.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true } }),
    ]);
    return facts(entity, "Payment", count, records.map((row) => ({ id: row.id, title: row.title, status: row.status })));
  }
  if (entity === "expenses") {
    const [count, records] = await Promise.all([
      prisma.expense.count({ where: { organizationId } }),
      prisma.expense.findMany({ where: { organizationId }, orderBy: { expenseDate: "desc" }, select: { id: true, title: true, category: true, status: true } }),
    ]);
    return facts(entity, "Expense", count, records.map((row) => ({ id: row.id, title: row.title, category: row.category, status: row.status })));
  }
  if (entity === "tasks") {
    const [count, records] = await Promise.all([
      prisma.task.count({ where: { organizationId } }),
      prisma.task.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, priority: true } }),
    ]);
    return facts(entity, "Task", count, records.map((row) => ({ id: row.id, title: row.title, status: row.status, priority: row.priority })));
  }
  const [count, records] = await Promise.all([
    prisma.person.count({ where: { organizationId } }),
    prisma.person.findMany({ where: { organizationId }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, type: true, title: true } }),
  ]);
  return facts(entity, "Person", count, records.map((row) => ({ id: row.id, name: row.fullName, type: row.type, title: row.title })));
}

function facts(
  entity: CanonicalBusinessFactEntity,
  model: CanonicalBusinessFacts["model"],
  count: number,
  records: CanonicalBusinessFacts["records"],
): CanonicalBusinessFacts {
  if (records.length !== count) {
    throw new Error(`Canonical ${model} count/list mismatch: count=${count}, records=${records.length}`);
  }
  return Object.freeze({ entity, model, count, records: Object.freeze(records) });
}

export function serializeCanonicalBusinessFacts(factsByEntity: readonly CanonicalBusinessFacts[]): string | null {
  if (factsByEntity.length === 0) return null;
  return [
    "Canonical table facts for entity types explicitly mentioned by the user:",
    ...factsByEntity.map((item) =>
      `${item.model}: exact organization-scoped total=${item.count}; complete canonically scoped records=${JSON.stringify(item.records)}. `
      + "The total and list use the same canonical organization and lifecycle scope. "
      + "Answer simple totals, lists, existence and type-level information from this data; never substitute a sampled intelligence signal.",
    ),
  ].join("\n");
}

export function canonicalFactsFromConversationArtifacts(artifacts: readonly ConversationTurnArtifact[]): readonly CanonicalBusinessFacts[] {
  return artifacts.map((artifact) => Object.freeze({
    entity: artifact.entity,
    model: artifact.model,
    count: artifact.records.length,
    records: Object.freeze(artifact.records.map((record) => Object.freeze({ ...record }))),
  }));
}
