import { prisma } from "@/lib/core/shared/prisma";
import { toCents } from "./ledger.service";

export type CustomerStatementLedgerLine = Readonly<{ accountCode: string; accountName: string; debitCents: string; creditCents: string; currency: string }>;
export type CustomerStatementLedgerEntry = Readonly<{ id: string; entryDate: string; description: string; reversalOfId: string | null; lines: readonly CustomerStatementLedgerLine[] }>;
export type CustomerStatementMovement = Readonly<{
  id: string;
  sourceType: "INVOICE" | "PAYMENT";
  sourceId: string;
  date: string;
  title: string;
  status: string;
  amountCents: string;
  balanceDeltaCents: string;
  runningBalanceCents: string;
  currency: string;
  ledgerMissing: boolean;
  ledgerEntries: readonly CustomerStatementLedgerEntry[];
}>;
export type CustomerStatement = Readonly<{
  customer: Readonly<{ id: string; displayName: string }>;
  movements: readonly CustomerStatementMovement[];
  balances: readonly Readonly<{ currency: string; balanceCents: string }>[];
  sourceCounts: Readonly<{ invoices: number; payments: number; ledgerEntries: number; ledgerMissingMovements: number }>;
  dataQualityNote: string | null;
}>;

type InvoiceRow = Awaited<ReturnType<typeof readInvoices>>[number];
type PaymentRow = Awaited<ReturnType<typeof readPayments>>[number];
type LedgerRow = Awaited<ReturnType<typeof readLedgerEntries>>[number];

export async function getCustomerStatement(organizationId: string, customerId: string): Promise<CustomerStatement | null> {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { id: true, displayName: true } });
  if (!customer) return null;
  const [invoices, payments] = await Promise.all([readInvoices(organizationId, customerId), readPayments(organizationId, customerId)]);
  const sourceIds = [...invoices.map((row) => row.id), ...payments.map((row) => row.id)];
  const ledgerEntries = sourceIds.length ? await readLedgerEntries(organizationId, sourceIds) : [];
  return buildCustomerStatement(customer, invoices, payments, ledgerEntries);
}

export function buildCustomerStatement(
  customer: { id: string; displayName: string },
  invoices: readonly InvoiceRow[],
  payments: readonly PaymentRow[],
  ledgerEntries: readonly LedgerRow[],
): CustomerStatement {
  const ledgerBySource = new Map<string, LedgerRow[]>();
  for (const entry of ledgerEntries) {
    const key = `${entry.sourceType}:${entry.sourceId}`;
    ledgerBySource.set(key, [...(ledgerBySource.get(key) ?? []), entry]);
  }
  const movements: Array<Omit<CustomerStatementMovement, "runningBalanceCents"> & { delta: bigint }> = [
    ...invoices.map((invoice) => movementFromInvoice(invoice, ledgerBySource.get(`INVOICE:${invoice.id}`) ?? [])),
    ...payments.map((payment) => movementFromPayment(payment, ledgerBySource.get(`PAYMENT:${payment.id}`) ?? [])),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const balances = new Map<string, bigint>();
  const withBalances = movements.map(({ delta, ...movement }) => {
    const running = (balances.get(movement.currency) ?? BigInt(0)) + delta;
    balances.set(movement.currency, running);
    return Object.freeze({ ...movement, runningBalanceCents: running.toString() });
  });
  const ledgerMissingMovements = withBalances.filter((movement) => movement.ledgerMissing).length;
  return Object.freeze({
    customer: Object.freeze(customer),
    movements: Object.freeze(withBalances),
    balances: Object.freeze([...balances].sort(([a], [b]) => a.localeCompare(b)).map(([currency, balanceCents]) => Object.freeze({ currency, balanceCents: balanceCents.toString() }))),
    sourceCounts: Object.freeze({ invoices: invoices.length, payments: payments.length, ledgerEntries: ledgerEntries.length, ledgerMissingMovements }),
    dataQualityNote: ledgerMissingMovements ? "Bazı hareketlerde defter kaydı bulunmuyor. Faz 2 öncesindeki kayıtlar geriye dönük deftere işlenmedi; bakiye canonical fatura/tahsilat alanlarından tamamlandı." : null,
  });
}

function movementFromInvoice(invoice: InvoiceRow, ledgerEntries: readonly LedgerRow[]) {
  const ledgerDelta = receivableDelta(ledgerEntries, invoice.currency);
  const delta = ledgerEntries.length ? ledgerDelta : (["SENT", "PAID"].includes(invoice.status) ? toCents(invoice.totalAmount) : BigInt(0));
  const date = ledgerEntries[0]?.entryDate ?? invoice.createdAt;
  return baseMovement({ id: invoice.id, sourceType: "INVOICE", date, title: `${invoice.invoiceNumber} · ${invoice.title}`, status: invoice.status, amount: invoice.totalAmount, currency: invoice.currency, delta, ledgerEntries });
}

function movementFromPayment(payment: PaymentRow, ledgerEntries: readonly LedgerRow[]) {
  const ledgerDelta = receivableDelta(ledgerEntries, payment.currency);
  const delta = ledgerEntries.length ? ledgerDelta : -toCents(payment.paidAmount);
  const date = ledgerEntries[0]?.entryDate ?? payment.paidAt ?? (Number(payment.paidAmount) > 0 ? payment.updatedAt : payment.createdAt);
  return baseMovement({ id: payment.id, sourceType: "PAYMENT", date, title: payment.title, status: payment.status, amount: payment.amount, currency: payment.currency, delta, ledgerEntries });
}

function baseMovement(input: { id: string; sourceType: "INVOICE" | "PAYMENT"; date: Date; title: string; status: string; amount: unknown; currency: string; delta: bigint; ledgerEntries: readonly LedgerRow[] }) {
  return Object.freeze({ id: `${input.sourceType}:${input.id}`, sourceType: input.sourceType, sourceId: input.id, date: input.date.toISOString(), title: input.title, status: input.status, amountCents: toCents(input.amount as number).toString(), balanceDeltaCents: input.delta.toString(), currency: input.currency, ledgerMissing: input.ledgerEntries.length === 0 && input.delta !== BigInt(0), ledgerEntries: input.ledgerEntries.map(serializeLedgerEntry), delta: input.delta });
}

function receivableDelta(entries: readonly LedgerRow[], currency: string) {
  return entries.flatMap((entry) => entry.lines).filter((line) => line.account.code === "120" && line.currency === currency).reduce((sum, line) => sum + line.debitCents - line.creditCents, BigInt(0));
}

function serializeLedgerEntry(entry: LedgerRow): CustomerStatementLedgerEntry {
  return Object.freeze({ id: entry.id, entryDate: entry.entryDate.toISOString(), description: entry.description, reversalOfId: entry.reversalOfId, lines: Object.freeze(entry.lines.map((line) => Object.freeze({ accountCode: line.account.code, accountName: line.account.name, debitCents: line.debitCents.toString(), creditCents: line.creditCents.toString(), currency: line.currency }))) });
}

function readInvoices(organizationId: string, customerId: string) {
  return prisma.invoice.findMany({ where: { organizationId, customerId }, select: { id: true, invoiceNumber: true, title: true, totalAmount: true, currency: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } });
}
function readPayments(organizationId: string, customerId: string) {
  return prisma.payment.findMany({ where: { organizationId, customerId }, select: { id: true, title: true, amount: true, paidAmount: true, currency: true, status: true, paidAt: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" } });
}
function readLedgerEntries(organizationId: string, sourceIds: readonly string[]) {
  return prisma.ledgerEntry.findMany({ where: { organizationId, sourceType: { in: ["INVOICE", "PAYMENT"] }, sourceId: { in: [...sourceIds] } }, include: { lines: { include: { account: true }, orderBy: { createdAt: "asc" } } }, orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }] });
}
