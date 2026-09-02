import { resolveManagementPeriod } from "@/lib/management-period";
import type { ResolvableCustomer } from "@/lib/customers/customer-resolution";
import type { CompanyQueryDateRange } from "./company-query-plan.types";

// Lazy — mirrors the reader?: Reader pattern already used in
// src/lib/sales-intelligence/commercial-performance.ts. A top-level static
// import of "@/lib/core/shared/prisma" would eagerly construct a real
// PrismaClient (and throw without DATABASE_URL) the moment this module is
// imported, even in tests that always pass a fake db — so the real client is
// only ever loaded when no override is given.
async function defaultPrisma(): Promise<typeof import("@/lib/core/shared/prisma").prisma> {
  return (await import("@/lib/core/shared/prisma")).prisma;
}

export type CompanyQueryDateWindow = Readonly<{ start: Date; end: Date; label: string }>;

// Fully reuses the existing management-period resolver (LAST_N_DAYS maps to
// its ROLLING_DAYS kind) — no new date arithmetic. The model never computes
// an absolute date itself; it only supplies a small integer or a closed
// period kind, resolved here from the real server clock.
export function resolveCompanyQueryDateRange(
  range: CompanyQueryDateRange,
  now: Date,
  timeZone: string,
): CompanyQueryDateWindow {
  const period = range.kind === "LAST_N_DAYS"
    ? resolveManagementPeriod({ kind: "ROLLING_DAYS", now, timeZone, rollingDays: range.days })
    : resolveManagementPeriod({ kind: range.kind, now, timeZone });
  return { start: period.start, end: period.end, label: period.label };
}

type CustomerReader = {
  findMany(args: unknown): Promise<ResolvableCustomer[]>;
};

export async function listActiveCustomers(
  organizationId: string,
  db?: { customer: CustomerReader },
): Promise<readonly ResolvableCustomer[]> {
  const client = db ?? (await defaultPrisma()) as unknown as { customer: CustomerReader };
  return client.customer.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true, displayName: true, legalName: true, phone: true, email: true, cariKodu: true, taxNumber: true },
  });
}

export type CustomerQuoteRow = Readonly<{
  id: string;
  customerId: string;
  customerName: string;
  status: string;
  amount: number | null;
  currency: string;
  sentAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdAt: string;
}>;

type QuoteRawRow = {
  id: string;
  customerId: string | null;
  customer: { displayName: string } | null;
  status: string;
  amount: unknown;
  currency: string;
  sentAt: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  createdAt: Date;
};

type QuoteReader = { findMany(args: unknown): Promise<QuoteRawRow[]> };

function mapQuoteRow(row: QuoteRawRow): CustomerQuoteRow | null {
  if (!row.customerId) return null;
  return Object.freeze({
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.displayName ?? "Müşterisi belirtilmemiş",
    status: row.status,
    amount: row.amount == null ? null : Number(row.amount),
    currency: row.currency,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    wonAt: row.wonAt ? row.wonAt.toISOString() : null,
    lostAt: row.lostAt ? row.lostAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  });
}

const QUOTE_SELECT = {
  id: true, customerId: true, customer: { select: { displayName: true } },
  status: true, amount: true, currency: true, sentAt: true, wonAt: true, lostAt: true, createdAt: true,
} as const;

/** Every distinct customer with >=1 quote SENT inside [window.start, window.end). */
export async function readQuotesSentInRange(
  organizationId: string,
  window: Readonly<{ start: Date; end: Date }>,
  db?: { quote: QuoteReader },
): Promise<readonly CustomerQuoteRow[]> {
  const client = db ?? (await defaultPrisma()) as unknown as { quote: QuoteReader };
  const rows = await client.quote.findMany({
    where: { organizationId, sentAt: { gte: window.start, lt: window.end } },
    select: QUOTE_SELECT,
  });
  return Object.freeze(rows.map(mapQuoteRow).filter((row): row is CustomerQuoteRow => row !== null));
}

const RECENT_CUSTOMER_HISTORY_LIMIT = 50;

/** All quotes for one customer, optionally scoped to a date window (by sentAt when given, else all-time capped). */
export async function readQuotesForCustomer(
  organizationId: string,
  customerId: string,
  window: Readonly<{ start: Date; end: Date }> | null,
  db?: { quote: QuoteReader },
): Promise<readonly CustomerQuoteRow[]> {
  const client = db ?? (await defaultPrisma()) as unknown as { quote: QuoteReader };
  const rows = await client.quote.findMany({
    where: {
      organizationId,
      customerId,
      ...(window ? { sentAt: { gte: window.start, lt: window.end } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: RECENT_CUSTOMER_HISTORY_LIMIT,
    select: QUOTE_SELECT,
  });
  return Object.freeze(rows.map(mapQuoteRow).filter((row): row is CustomerQuoteRow => row !== null));
}

export type CustomerOrderRow = Readonly<{
  id: string;
  customerId: string;
  status: string;
  confirmedAt: string;
  confirmedValueCents: string | null;
  currency: string;
}>;

type OrderRawRow = {
  id: string;
  customerId: string;
  status: string;
  confirmedAt: Date | null;
  confirmedValueCents: bigint | null;
  confirmationCurrency: string | null;
  currency: string;
};

type OrderReader = { findMany(args: unknown): Promise<OrderRawRow[]> };

const ORDER_SELECT = {
  id: true, customerId: true, status: true, confirmedAt: true,
  confirmedValueCents: true, confirmationCurrency: true, currency: true,
} as const;

function mapOrderRow(row: OrderRawRow): CustomerOrderRow | null {
  if (!row.confirmedAt) return null;
  return Object.freeze({
    id: row.id,
    customerId: row.customerId,
    status: row.status,
    confirmedAt: row.confirmedAt.toISOString(),
    confirmedValueCents: row.confirmedValueCents == null ? null : row.confirmedValueCents.toString(),
    currency: row.confirmationCurrency ?? row.currency,
  });
}

/** Every distinct customer with >=1 order CONFIRMED (canonical confirmed-order truth) inside [window.start, window.end). */
export async function readConfirmedOrdersInRange(
  organizationId: string,
  window: Readonly<{ start: Date; end: Date }>,
  db?: { order: OrderReader },
): Promise<readonly CustomerOrderRow[]> {
  const client = db ?? (await defaultPrisma()) as unknown as { order: OrderReader };
  const rows = await client.order.findMany({
    where: { organizationId, confirmedAt: { gte: window.start, lt: window.end } },
    select: ORDER_SELECT,
  });
  return Object.freeze(rows.map(mapOrderRow).filter((row): row is CustomerOrderRow => row !== null));
}

/** All confirmed orders for one customer, optionally scoped to a date window (else all-time capped). */
export async function readConfirmedOrdersForCustomer(
  organizationId: string,
  customerId: string,
  window: Readonly<{ start: Date; end: Date }> | null,
  db?: { order: OrderReader },
): Promise<readonly CustomerOrderRow[]> {
  const client = db ?? (await defaultPrisma()) as unknown as { order: OrderReader };
  const rows = await client.order.findMany({
    where: {
      organizationId,
      customerId,
      confirmedAt: window ? { gte: window.start, lt: window.end } : { not: null },
    },
    orderBy: { confirmedAt: "desc" },
    take: RECENT_CUSTOMER_HISTORY_LIMIT,
    select: ORDER_SELECT,
  });
  return Object.freeze(rows.map(mapOrderRow).filter((row): row is CustomerOrderRow => row !== null));
}

export type CustomerCommercialTerms = Readonly<{
  paymentTermDays: number | null;
  creditLimitCents: string | null;
  defaultCurrency: string | null;
  deliveryTerm: string | null;
}>;

type TermsRawRow = {
  paymentTermDays: number | null;
  creditLimitCents: bigint | null;
  defaultCurrency: string | null;
  deliveryTerm: string | null;
};

type TermsReader = { findFirst(args: unknown): Promise<TermsRawRow | null> };

export async function readCommercialTermsForCustomer(
  organizationId: string,
  customerId: string,
  db?: { customerCommercialTerms: TermsReader },
): Promise<CustomerCommercialTerms | null> {
  const client = db ?? (await defaultPrisma()) as unknown as { customerCommercialTerms: TermsReader };
  const row = await client.customerCommercialTerms.findFirst({
    where: { organizationId, customerId },
    select: { paymentTermDays: true, creditLimitCents: true, defaultCurrency: true, deliveryTerm: true },
  });
  if (!row) return null;
  return Object.freeze({
    paymentTermDays: row.paymentTermDays,
    creditLimitCents: row.creditLimitCents == null ? null : row.creditLimitCents.toString(),
    defaultCurrency: row.defaultCurrency,
    deliveryTerm: row.deliveryTerm,
  });
}
