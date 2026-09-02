import type { ManagementIntent } from "@/lib/conversation-understanding";
import { dateStringInTimeZone } from "@/lib/core/calendar/calendar-timezone";
import type { CurrentReceivableDataset } from "@/lib/core/reporting/current-receivable-intelligence.service";
import type { FinancialManagementSynthesisDataset } from "@/lib/financial-overview/financial-management-synthesis";
import { buildFinancialManagementSynthesisResponse } from "@/lib/financial-overview/financial-management-synthesis";
import { buildFinancialAttentionResponse } from "@/lib/financial-attention/financial-attention.policy";
import type { CurrentQuotePipelineDataset } from "@/lib/sales-intelligence";
import { resolveManagementPeriod } from "@/lib/management-period";

type InvoicedIntent = Extract<ManagementIntent, { intent: "INVOICED_ACTIVITY" }>;
type OrderIntent = Extract<ManagementIntent, { intent: "ORDER_OPERATIONS" }>;
type LedgerRow = Readonly<{ sourceId: string; reversalOfId: string | null; lines: readonly Readonly<{ accountId: string; debitCents: bigint; creditCents: bigint; currency: string }>[] }>;
type InvoiceRow = Readonly<{ id: string; customerId: string | null; customer: { id: string; displayName: string } | null }>;
type InvoiceReader = Readonly<{ ledgerEntry: { findMany(args: unknown): Promise<readonly LedgerRow[]> }; invoice: { findMany(args: unknown): Promise<readonly InvoiceRow[]> } }>;
type OrderRow = Readonly<{ id: string; orderNumber: string; status: string; deadlineAt: Date | null; customerId: string; customer: { id: string; displayName: string } }>;
type TaskRow = Readonly<{ id: string; title: string; dueDate: Date | null }>;
type OperationsReader = Readonly<{ order: { findMany(args: unknown): Promise<readonly OrderRow[]> }; task: { findMany(args: unknown): Promise<readonly TaskRow[]> } }>;

export type InvoicedActivityDataset = Readonly<{ intent: InvoicedIntent; period: Readonly<{ label: string; start: string; endExclusive: string; timeZone: string }>; postingCount: number; invoiceCount: number; reversalCount: number; currencies: readonly Readonly<{ currency: string; netPostedCents: string }>[]; customers: readonly Readonly<{ customerId: string | null; customerName: string; invoiceCount: number; currencies: readonly Readonly<{ currency: string; netPostedCents: string }>[] }>[] }>;
export type CurrentOrderOperationsDataset = Readonly<{ openOrderCount: number; overdueOrderCount: number; dueTodayCount: number; statusCounts: readonly Readonly<{ status: string; count: number }>[]; orders: readonly Readonly<{ orderId: string; orderNumber: string; status: string; deadline: string | null; customerId: string; customerName: string; overdue: boolean }>[]; customers: readonly Readonly<{ customerId: string; customerName: string; openOrderCount: number; overdueOrderCount: number }>[] }>;
export type OperationsManagementDataset = Readonly<{ asOf: string; timeZone: string; orders: CurrentOrderOperationsDataset; openTaskCount: number; overdueTaskCount: number; dueTodayTaskCount: number }>;
export type CustomerManagementDataset = Readonly<{ customers: readonly Readonly<{ customerId: string | null; customerName: string; openQuoteCount: number; openOrderCount: number; overdueOrderCount: number; receivables: readonly Readonly<{ currency: string; outstanding: number; overdue: number }>[]; invoiced: readonly Readonly<{ currency: string; netPostedCents: string }>[] }>[] }>;
export type CompanyManagementDataset = Readonly<{ financial: FinancialManagementSynthesisDataset; quotePipeline: CurrentQuotePipelineDataset; invoicedActivity: InvoicedActivityDataset; operations: OperationsManagementDataset }>;

const moneyFromCents = (cents: bigint, currency: string) => `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(cents) / 100)} ${currency}`;
const add = (map: Map<string, bigint>, currency: string, amount: bigint) => map.set(currency, (map.get(currency) ?? BigInt(0)) + amount);

export async function buildInvoicedActivityDataset(organizationId: string, input: { intent: InvoicedIntent; now: Date; timeZone: string }, reader?: InvoiceReader): Promise<InvoicedActivityDataset> {
  const db: InvoiceReader = reader ?? (await import("@/lib/core/shared/prisma")).prisma as unknown as InvoiceReader;
  const period = resolveManagementPeriod({ kind: input.intent.period, now: input.now, timeZone: input.timeZone });
  const postings = await db.ledgerEntry.findMany({ where: { organizationId, sourceType: "INVOICE", entryDate: { gte: period.start, lt: period.end } }, select: { sourceId: true, reversalOfId: true, lines: { select: { accountId: true, debitCents: true, creditCents: true, currency: true } } } });
  const invoiceIds = [...new Set(postings.map((row) => row.sourceId))];
  const invoices = invoiceIds.length ? await db.invoice.findMany({ where: { organizationId, id: { in: invoiceIds } }, select: { id: true, customerId: true, customer: { select: { id: true, displayName: true } } } }) : [];
  const invoiceById = new Map(invoices.map((row) => [row.id, row]));
  const totals = new Map<string, bigint>(); const customerGroups = new Map<string, { customerId: string | null; customerName: string; invoiceIds: Set<string>; totals: Map<string, bigint> }>();
  for (const posting of postings) for (const line of posting.lines.filter((row) => row.accountId === "ledger-account-120")) {
    const signed = line.debitCents - line.creditCents; add(totals, line.currency, signed);
    const invoice = invoiceById.get(posting.sourceId); const key = invoice?.customer?.id ?? "__unknown__";
    const group = customerGroups.get(key) ?? { customerId: invoice?.customer?.id ?? null, customerName: invoice?.customer?.displayName ?? "Müşterisi belirtilmemiş", invoiceIds: new Set<string>(), totals: new Map<string, bigint>() };
    group.invoiceIds.add(posting.sourceId); add(group.totals, line.currency, signed); customerGroups.set(key, group);
  }
  return Object.freeze({ intent: input.intent, period: Object.freeze({ label: period.label, start: period.start.toISOString(), endExclusive: period.end.toISOString(), timeZone: period.timeZone }), postingCount: postings.length, invoiceCount: new Set(postings.filter((row) => row.reversalOfId === null).map((row) => row.sourceId)).size, reversalCount: postings.filter((row) => row.reversalOfId !== null).length, currencies: Object.freeze([...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => Object.freeze({ currency, netPostedCents: amount.toString() }))), customers: Object.freeze([...customerGroups.values()].sort((a, b) => a.customerName.localeCompare(b.customerName, "tr")).map((group) => Object.freeze({ customerId: group.customerId, customerName: group.customerName, invoiceCount: group.invoiceIds.size, currencies: Object.freeze([...group.totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => Object.freeze({ currency, netPostedCents: amount.toString() }))) }))) });
}

export function buildInvoicedActivityResponse(dataset: InvoicedActivityDataset): string {
  if (dataset.postingCount === 0) return `${dataset.period.label} döneminde muhasebeye postalanmış fatura hareketi bulunmuyor.`;
  const totals = dataset.currencies.map((row) => moneyFromCents(BigInt(row.netPostedCents), row.currency)).join(" ve ");
  return `${dataset.period.label} döneminde ${dataset.invoiceCount} fatura muhasebeye işlendi; net postalanmış fatura tutarı ${totals}.${dataset.reversalCount ? ` Dönemde ${dataset.reversalCount} ters kayıt da bulunuyor.` : ""}`;
}

export async function buildCurrentOrderOperationsDataset(organizationId: string, input: { now: Date; timeZone: string }, reader?: OperationsReader): Promise<CurrentOrderOperationsDataset> {
  const db: OperationsReader = reader ?? (await import("@/lib/core/shared/prisma")).prisma as unknown as OperationsReader;
  const today = dateStringInTimeZone(input.now, input.timeZone);
  const source = await db.order.findMany({ where: { organizationId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, orderNumber: true, status: true, deadlineAt: true, customerId: true, customer: { select: { id: true, displayName: true } } } });
  const orders = source.map((row) => { const deadline = row.deadlineAt ? dateStringInTimeZone(row.deadlineAt, input.timeZone) : null; return Object.freeze({ orderId: row.id, orderNumber: row.orderNumber, status: row.status, deadline, customerId: row.customer.id, customerName: row.customer.displayName, overdue: deadline !== null && deadline < today }); });
  const statuses = new Map<string, number>(); const customers = new Map<string, { customerId: string; customerName: string; openOrderCount: number; overdueOrderCount: number }>();
  for (const row of orders) { statuses.set(row.status, (statuses.get(row.status) ?? 0) + 1); const customer = customers.get(row.customerId) ?? { customerId: row.customerId, customerName: row.customerName, openOrderCount: 0, overdueOrderCount: 0 }; customer.openOrderCount += 1; if (row.overdue) customer.overdueOrderCount += 1; customers.set(row.customerId, customer); }
  return Object.freeze({ openOrderCount: orders.length, overdueOrderCount: orders.filter((row) => row.overdue).length, dueTodayCount: orders.filter((row) => row.deadline === today).length, statusCounts: Object.freeze([...statuses].sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => Object.freeze({ status, count }))), orders: Object.freeze(orders), customers: Object.freeze([...customers.values()].sort((a, b) => a.customerName.localeCompare(b.customerName, "tr")).map((row) => Object.freeze(row))) });
}

export function buildOrderOperationsResponse(intent: OrderIntent, dataset: CurrentOrderOperationsDataset): string {
  if (dataset.openOrderCount === 0) return "Şu anda açık operasyonel sipariş bulunmuyor.";
  if (intent.queryMode === "OVERDUE") return dataset.overdueOrderCount ? `Şu anda teslim tarihi geçmiş ${dataset.overdueOrderCount} açık sipariş bulunuyor.` : "Şu anda teslim tarihi geçmiş açık sipariş bulunmuyor.";
  if (intent.queryMode === "CUSTOMER_DISTRIBUTION") return `Açık siparişler müşteri bazında: ${dataset.customers.map((row) => `${row.customerName}: ${row.openOrderCount}${row.overdueOrderCount ? ` (${row.overdueOrderCount} teslim tarihi geçmiş)` : ""}`).join("; ")}.`;
  return `Şu anda ${dataset.openOrderCount} açık operasyonel sipariş bulunuyor; ${dataset.overdueOrderCount} tanesinin teslim tarihi geçmiş, ${dataset.dueTodayCount} tanesinin teslim tarihi bugün.`;
}

export async function buildOperationsManagementDataset(organizationId: string, input: { now: Date; timeZone: string }, reader?: OperationsReader): Promise<OperationsManagementDataset> {
  const db: OperationsReader = reader ?? (await import("@/lib/core/shared/prisma")).prisma as unknown as OperationsReader;
  const [orders, tasks] = await Promise.all([buildCurrentOrderOperationsDataset(organizationId, input, db), db.task.findMany({ where: { organizationId, status: "OPEN" }, select: { id: true, title: true, dueDate: true } })]);
  const today = dateStringInTimeZone(input.now, input.timeZone); const due = tasks.map((row) => row.dueDate ? dateStringInTimeZone(row.dueDate, input.timeZone) : null);
  return Object.freeze({ asOf: input.now.toISOString(), timeZone: input.timeZone, orders, openTaskCount: tasks.length, overdueTaskCount: due.filter((row) => row !== null && row < today).length, dueTodayTaskCount: due.filter((row) => row === today).length });
}

export function buildOperationsManagementResponse(dataset: OperationsManagementDataset): string {
  return `Operasyon tarafında ${dataset.orders.openOrderCount} açık sipariş ve ${dataset.openTaskCount} açık görev bulunuyor. Teslim tarihi geçmiş açık sipariş: ${dataset.orders.overdueOrderCount}; tarihi geçmiş açık görev: ${dataset.overdueTaskCount}.`;
}

export function buildCustomerManagementDataset(receivables: CurrentReceivableDataset, pipeline: CurrentQuotePipelineDataset, orders: CurrentOrderOperationsDataset, invoiced: InvoicedActivityDataset): CustomerManagementDataset {
  const map = new Map<string, { customerId: string | null; customerName: string; openQuoteCount: number; openOrderCount: number; overdueOrderCount: number; receivables: Map<string, { outstanding: number; overdue: number }>; invoiced: Map<string, string> }>();
  const get = (id: string | null, name: string) => { const key = id ?? `unknown:${name}`; const current = map.get(key) ?? { customerId: id, customerName: name, openQuoteCount: 0, openOrderCount: 0, overdueOrderCount: 0, receivables: new Map(), invoiced: new Map() }; map.set(key, current); return current; };
  pipeline.customers.forEach((row) => { get(row.customerId, row.customerName).openQuoteCount += row.quoteCount; });
  orders.customers.forEach((row) => { const item = get(row.customerId, row.customerName); item.openOrderCount += row.openOrderCount; item.overdueOrderCount += row.overdueOrderCount; });
  receivables.currencies.forEach((currency) => currency.customers.forEach((row) => { const item = get(row.customerId, row.customerName); item.receivables.set(currency.currency, { outstanding: row.totalOutstanding, overdue: row.overdueOutstanding }); }));
  invoiced.customers.forEach((row) => { const item = get(row.customerId, row.customerName); row.currencies.forEach((amount) => item.invoiced.set(amount.currency, amount.netPostedCents)); });
  return Object.freeze({ customers: Object.freeze([...map.values()].sort((a, b) => a.customerName.localeCompare(b.customerName, "tr")).map((row) => Object.freeze({ customerId: row.customerId, customerName: row.customerName, openQuoteCount: row.openQuoteCount, openOrderCount: row.openOrderCount, overdueOrderCount: row.overdueOrderCount, receivables: Object.freeze([...row.receivables].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amounts]) => Object.freeze({ currency, ...amounts }))), invoiced: Object.freeze([...row.invoiced].sort(([a], [b]) => a.localeCompare(b)).map(([currency, netPostedCents]) => Object.freeze({ currency, netPostedCents }))) }))) });
}

export function buildCustomerManagementResponse(dataset: CustomerManagementDataset): string {
  if (!dataset.customers.length) return "Şu anda açık alacak, açık teklif veya açık siparişle bağlantılı müşteri bulunmuyor.";
  const format = (n: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
  return `Güncel müşteri görünümü: ${dataset.customers.map((row) => `${row.customerName}: ${row.openQuoteCount} açık teklif, ${row.openOrderCount} açık sipariş${row.receivables.length ? `, açık alacak ${row.receivables.map((item) => `${format(item.outstanding)} ${item.currency}${item.overdue ? ` (${format(item.overdue)} gecikmiş)` : ""}`).join(" ve ")}` : ""}${row.invoiced.length ? `, bu dönem net postalanmış fatura ${row.invoiced.map((item) => moneyFromCents(BigInt(item.netPostedCents), item.currency)).join(" ve ")}` : ""}`).join("; ")}.`;
}

export function buildCompanyManagementResponse(dataset: CompanyManagementDataset): string {
  const financial = buildFinancialManagementSynthesisResponse(dataset.financial);
  const pipeline = dataset.quotePipeline.openQuoteCount ? `Şu anda ${dataset.quotePipeline.openQuoteCount} açık teklif bulunuyor.` : "Şu anda açık teklif bulunmuyor.";
  return `${financial} ${pipeline} ${buildInvoicedActivityResponse(dataset.invoicedActivity)} ${buildOperationsManagementResponse(dataset.operations)}`;
}

export function buildCompanyManagementAttentionResponse(dataset: CompanyManagementDataset): string {
  const operational: string[] = [];
  if (dataset.operations.orders.overdueOrderCount > 0) operational.push(`teslim tarihi geçmiş ${dataset.operations.orders.overdueOrderCount} açık sipariş`);
  if (dataset.operations.overdueTaskCount > 0) operational.push(`tarihi geçmiş ${dataset.operations.overdueTaskCount} açık görev`);
  const financial = buildFinancialAttentionResponse(dataset.financial.attention);
  return operational.length ? `${financial} Operasyon tarafında ${operational.join(" ve ")} bulunuyor.` : `${financial} Operasyon tarafında tanımlı kurallara göre ayrıca dikkat gerektiren gecikmiş iş bulunmuyor.`;
}

export const buildManagementIntelligencePromptLine = (label: string, dataset: unknown) => `Canonical ${label} management evidence (deterministic; no scoring, forecast, or causality): ${JSON.stringify(dataset)}.`;
