import type { MaterializedMaturity, PaymentTermComponent, StructuredPaymentTerm } from "./payment-term.types";

export class PaymentTermValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PaymentTermValidationError"; }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const CURRENCY = /^[A-Z]{3}$/u;

export function parseStructuredPaymentTerm(value: unknown): StructuredPaymentTerm {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.strategy !== "SCHEDULE" || !Array.isArray(value.components)) {
    throw new PaymentTermValidationError("payment term must use the canonical schedule schema.");
  }
  if (value.components.length === 0) throw new PaymentTermValidationError("payment term requires at least one component.");
  const components = value.components.map(parseComponent);
  const fingerprints = new Set(components.map((item) => JSON.stringify(item)));
  if (fingerprints.size !== components.length) throw new PaymentTermValidationError("duplicate payment term components are not allowed.");
  const remainderCount = components.filter((item) => item.allocationType === "REMAINDER").length;
  if (remainderCount > 1) throw new PaymentTermValidationError("payment term may contain at most one remainder component.");
  if (remainderCount === 1 && components.at(-1)?.allocationType !== "REMAINDER") throw new PaymentTermValidationError("remainder must be the final schedule component.");
  const percentages = components.filter((item) => item.allocationType === "PERCENTAGE");
  const hasFixedOrRemainder = components.some((item) => item.allocationType !== "PERCENTAGE");
  if (!hasFixedOrRemainder) {
    const total = percentages.reduce((sum, item) => sum + item.percentageBasisPoints, 0);
    if (total !== 10_000) throw new PaymentTermValidationError("percentage-only schedules must total exactly 100%.");
  } else if (percentages.reduce((sum, item) => sum + item.percentageBasisPoints, 0) >= 10_000) {
    throw new PaymentTermValidationError("mixed schedules must leave a positive allocation for fixed or remainder components.");
  }
  const description = typeof value.description === "string" && value.description.trim() ? value.description.trim() : undefined;
  return { schemaVersion: 1, strategy: "SCHEDULE", ...(description ? { description } : {}), components };
}

export function validatePaymentTermForDocument(term: StructuredPaymentTerm, totalCents: bigint, currency: string): void {
  if (totalCents <= BigInt(0)) throw new PaymentTermValidationError("document total must be positive.");
  const normalizedCurrency = currency.trim().toUpperCase();
  let fixedTotal = BigInt(0);
  let percentageBasisPoints = 0;
  for (const item of term.components) {
    if (item.allocationType === "PERCENTAGE") percentageBasisPoints += item.percentageBasisPoints;
    if (item.allocationType === "FIXED_AMOUNT") {
      if (item.currency !== normalizedCurrency) throw new PaymentTermValidationError("cross-currency fixed allocations are not supported.");
      fixedTotal += BigInt(item.amountCents);
    }
  }
  if (fixedTotal > totalCents) throw new PaymentTermValidationError("fixed allocations must not exceed the document total.");
  if (!term.components.some((item) => item.allocationType === "REMAINDER")) {
    const allocated = fixedTotal + totalCents * BigInt(percentageBasisPoints) / BigInt(10_000);
    if (allocated !== totalCents) throw new PaymentTermValidationError("schedule without remainder must allocate the full document total.");
  }
}

export function materializePaymentTerm(input: {
  term: StructuredPaymentTerm;
  totalCents: bigint;
  currency: string;
  references: Partial<Record<"QUOTE_DATE" | "ORDER_DATE" | "INVOICE_DATE" | "DELIVERY_DATE", Date>>;
}): MaterializedMaturity[] {
  validatePaymentTermForDocument(input.term, input.totalCents, input.currency);
  const earliestReference = Object.values(input.references).filter((value): value is Date => value instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0];
  if (earliestReference) {
    for (const component of input.term.components) {
      if (component.maturityBasis === "FIXED_DATE" && new Date(`${component.dueDate}T00:00:00.000Z`) < startOfUtcDay(earliestReference)) throw new PaymentTermValidationError("fixed due date must not precede the reference date.");
    }
  }
  let allocated = BigInt(0);
  return input.term.components.map((component, index) => {
    let amount: bigint;
    if (component.allocationType === "FIXED_AMOUNT") amount = BigInt(component.amountCents);
    else if (component.allocationType === "REMAINDER") amount = input.totalCents - allocated;
    else {
      amount = index === input.term.components.length - 1
        ? input.totalCents - allocated
        : input.totalCents * BigInt(component.percentageBasisPoints) / BigInt(10_000);
    }
    if (amount <= BigInt(0)) throw new PaymentTermValidationError("materialized allocations must be positive.");
    allocated += amount;
    return { componentIndex: index, amountCents: amount.toString(), dueDate: resolveDueDate(component, input.references) };
  }).map((item, index, rows) => {
    if (index === rows.length - 1 && allocated !== input.totalCents) throw new PaymentTermValidationError("schedule does not allocate the full document total.");
    return item;
  });
}

export function formatPaymentTerm(term: StructuredPaymentTerm): string {
  return term.components.map((item) => {
    const allocation = item.allocationType === "PERCENTAGE" ? `%${formatBasisPoints(item.percentageBasisPoints)}`
      : item.allocationType === "FIXED_AMOUNT" ? `${formatMinorUnits(item.amountCents)} ${item.currency}` : "kalan";
    const maturity = item.maturityBasis === "IMMEDIATE" ? "peşin"
      : item.maturityBasis === "FIXED_DATE" ? item.dueDate
      : `${item.days} gün (${referenceLabel(item.referenceDateType)})`;
    return `${allocation} ${maturity}`;
  }).join(" · ");
}

export function paymentTermFromDays(days: number, referenceDateType: "QUOTE_DATE" | "ORDER_DATE" | "INVOICE_DATE" = "INVOICE_DATE"): StructuredPaymentTerm {
  if (!Number.isInteger(days) || days < 0) throw new PaymentTermValidationError("payment term days must be a non-negative integer.");
  return { schemaVersion: 1, strategy: "SCHEDULE", components: [{ allocationType: "PERCENTAGE", percentageBasisPoints: 10_000, ...(days === 0 ? { maturityBasis: "IMMEDIATE" } : { maturityBasis: "DAYS_AFTER_REFERENCE", days, referenceDateType }) }] };
}

export function snapshotPaymentTermReferenceDates(quoteDate: Date, orderDate: Date) {
  return { QUOTE_DATE: dateOnly(quoteDate), ORDER_DATE: dateOnly(orderDate) } as const;
}

export function parseMaterializedMaturity(value: unknown): MaterializedMaturity {
  if (!isRecord(value) || !Number.isInteger(value.componentIndex) || Number(value.componentIndex) < 0 || typeof value.amountCents !== "string" || !/^[1-9]\d*$/u.test(value.amountCents) || typeof value.dueDate !== "string" || !isValidDateOnly(value.dueDate)) {
    throw new PaymentTermValidationError("maturity schedule component is invalid.");
  }
  return { componentIndex: Number(value.componentIndex), amountCents: value.amountCents, dueDate: value.dueDate };
}

export function resolvePaymentTermPrecedence(input: {
  explicitTransactionTerm?: unknown;
  customerDefaultTerm?: unknown;
  customerDefaultDays?: number | null;
}): StructuredPaymentTerm | undefined {
  if (input.explicitTransactionTerm !== undefined && input.explicitTransactionTerm !== null) return parseStructuredPaymentTerm(input.explicitTransactionTerm);
  if (input.customerDefaultTerm !== undefined && input.customerDefaultTerm !== null) return parseStructuredPaymentTerm(input.customerDefaultTerm);
  if (input.customerDefaultDays !== undefined && input.customerDefaultDays !== null) return paymentTermFromDays(input.customerDefaultDays);
  return undefined;
}

function parseComponent(value: unknown): PaymentTermComponent {
  if (!isRecord(value)) throw new PaymentTermValidationError("payment term component must be an object.");
  let allocation: Record<string, unknown>;
  if (value.allocationType === "PERCENTAGE") {
    if (!Number.isInteger(value.percentageBasisPoints) || Number(value.percentageBasisPoints) <= 0 || Number(value.percentageBasisPoints) > 10_000) throw new PaymentTermValidationError("percentage allocation must be between 1 and 10000 basis points.");
    allocation = { allocationType: "PERCENTAGE", percentageBasisPoints: value.percentageBasisPoints };
  } else if (value.allocationType === "FIXED_AMOUNT") {
    if (typeof value.amountCents !== "string" || !/^[1-9]\d*$/u.test(value.amountCents)) throw new PaymentTermValidationError("fixed amount must be a positive integer-cent string.");
    if (typeof value.currency !== "string" || !CURRENCY.test(value.currency)) throw new PaymentTermValidationError("fixed amount currency must be an uppercase ISO currency code.");
    allocation = { allocationType: "FIXED_AMOUNT", amountCents: value.amountCents, currency: value.currency };
  } else if (value.allocationType === "REMAINDER") allocation = { allocationType: "REMAINDER" };
  else throw new PaymentTermValidationError("unknown allocation type.");

  if (value.maturityBasis === "IMMEDIATE") return { ...allocation, maturityBasis: "IMMEDIATE" } as PaymentTermComponent;
  if (value.maturityBasis === "FIXED_DATE") {
    if (typeof value.dueDate !== "string" || !isValidDateOnly(value.dueDate)) throw new PaymentTermValidationError("fixed due date must be a valid YYYY-MM-DD date.");
    return { ...allocation, maturityBasis: "FIXED_DATE", dueDate: value.dueDate } as PaymentTermComponent;
  }
  if (value.maturityBasis === "DAYS_AFTER_REFERENCE") {
    if (!Number.isInteger(value.days) || Number(value.days) <= 0) throw new PaymentTermValidationError("relative maturity days must be a positive integer.");
    if (!["QUOTE_DATE", "ORDER_DATE", "INVOICE_DATE", "DELIVERY_DATE"].includes(String(value.referenceDateType))) throw new PaymentTermValidationError("relative maturity requires a supported reference date.");
    return { ...allocation, maturityBasis: "DAYS_AFTER_REFERENCE", days: value.days, referenceDateType: value.referenceDateType } as PaymentTermComponent;
  }
  throw new PaymentTermValidationError("unknown maturity basis.");
}

function resolveDueDate(component: PaymentTermComponent, references: Partial<Record<"QUOTE_DATE" | "ORDER_DATE" | "INVOICE_DATE" | "DELIVERY_DATE", Date>>): string {
  if (component.maturityBasis === "FIXED_DATE") return component.dueDate;
  if (component.maturityBasis === "IMMEDIATE") {
    const reference = references.INVOICE_DATE ?? references.ORDER_DATE ?? references.QUOTE_DATE;
    if (!reference) throw new PaymentTermValidationError("immediate maturity requires a document reference date.");
    return dateOnly(reference);
  }
  const reference = references[component.referenceDateType];
  if (!reference) throw new PaymentTermValidationError(`missing ${component.referenceDateType} reference date.`);
  const due = new Date(reference); due.setUTCDate(due.getUTCDate() + component.days);
  return dateOnly(due);
}

function dateOnly(date: Date): string { return date.toISOString().slice(0, 10); }
function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && dateOnly(parsed) === value;
}
function startOfUtcDay(date: Date): Date { return new Date(`${dateOnly(date)}T00:00:00.000Z`); }
function formatBasisPoints(value: number): string { return value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2).replace(/0+$/u, "").replace(/\.$/u, ""); }
function formatMinorUnits(value: string): string { const padded = value.padStart(3, "0"); const major = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/gu, "."); const minor = padded.slice(-2); return minor === "00" ? major : `${major},${minor}`; }
function referenceLabel(value: string): string { return ({ QUOTE_DATE: "teklif tarihinden", ORDER_DATE: "sipariş tarihinden", INVOICE_DATE: "fatura tarihinden", DELIVERY_DATE: "teslim tarihinden" } as Record<string, string>)[value] ?? value; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
