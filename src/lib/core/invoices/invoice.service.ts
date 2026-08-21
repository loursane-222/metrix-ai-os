import { ApiValidationError } from "@/lib/api/validation";
import { getCustomerById } from "@/lib/core/customers/customer.repository";
import { findQuoteByIdForOrganization } from "@/lib/core/quotes/quote.service";
import { computeRequestHash, isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import { recordInvoiceSent } from "@/lib/accounting/ledger.service";

import {
  countInvoicesForOrganization,
  createInvoice,
  findInvoiceById as findInvoiceByIdFromRepository,
  findInvoiceByIdempotencyKey,
  listInvoicesForOrganization,
  markInvoiceSent,
} from "./invoice.repository";
import type { CreateInvoiceInput, CreateInvoiceOutcome, InvoiceResult } from "./invoice.types";

const DEFAULT_CURRENCY = "TRY";
const DEFAULT_TAX_RATE = 20;

export async function createNewInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceOutcome> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.customerId, "customerId");
  assertNonEmpty(input.title, "title");
  assertValidAmount(input.amount);

  const customer = await getCustomerById(input.customerId, input.organizationId);
  if (!customer) {
    throw new ApiValidationError("Customer not found.", 404);
  }

  const quoteId = await resolveValidatedQuoteId(input.organizationId, input.customerId, input.quoteId);

  const taxRate = input.taxRate ?? DEFAULT_TAX_RATE;
  assertValidTaxRate(taxRate);
  const taxAmount = roundMoney((input.amount * taxRate) / 100);
  const totalAmount = roundMoney(input.amount + taxAmount);
  const normalizedCurrency = normalizeCurrency(input.currency);
  const normalizedDueDate = input.dueDate ? input.dueDate.toISOString() : null;
  const idempotencyKey = input.idempotencyKey ?? null;
  const requestHash = idempotencyKey
    ? computeRequestHash({
        customerId: input.customerId,
        quoteId,
        title: input.title,
        amount: input.amount,
        taxRate,
        currency: normalizedCurrency,
        dueDate: normalizedDueDate,
        notes: input.notes ?? null,
      })
    : null;

  try {
    const invoiceNumber = input.invoiceNumber?.trim() || await nextInvoiceNumber(input.organizationId);
    const invoice = await createInvoice({
      organizationId: input.organizationId,
      customerId: input.customerId,
      quoteId,
      invoiceNumber,
      title: input.title,
      amount: input.amount,
      taxRate,
      taxAmount,
      totalAmount,
      currency: normalizedCurrency,
      dueDate: input.dueDate,
      notes: input.notes,
      idempotencyKey,
      requestHash,
    });

    return { created: true, invoice };
  } catch (error) {
    if (idempotencyKey && isIdempotencyKeyCollision(error)) {
      return resolveIdempotentReplay(input.organizationId, idempotencyKey, requestHash);
    }

    throw error;
  }
}

export async function listInvoices(organizationId: string): Promise<InvoiceResult[]> {
  assertNonEmpty(organizationId, "organizationId");
  return listInvoicesForOrganization(organizationId);
}

export async function findInvoiceById(invoiceId: string, organizationId: string): Promise<InvoiceResult | null> {
  assertNonEmpty(invoiceId, "invoiceId");
  assertNonEmpty(organizationId, "organizationId");
  return findInvoiceByIdFromRepository(invoiceId, organizationId);
}

export async function sendInvoice(input: {
  invoiceId: string;
  organizationId: string;
}): Promise<InvoiceResult> {
  assertNonEmpty(input.invoiceId, "invoiceId");
  assertNonEmpty(input.organizationId, "organizationId");

  return prisma.$transaction(async (tx) => {
    const invoice = await markInvoiceSent(input.invoiceId, input.organizationId, tx);
    if (invoice) {
      await recordInvoiceSent({
        tx,
        organizationId: input.organizationId,
        invoiceId: invoice.id,
        entryDate: new Date(),
        netAmount: invoice.amount,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
      });
      return invoice;
    }

    const existing = await findInvoiceByIdFromRepository(input.invoiceId, input.organizationId, tx);
    if (!existing) throw new ApiValidationError("Invoice not found.", 404);
    throw new ApiValidationError("Only draft invoices can be marked as sent.", 409);
  });
}

async function nextInvoiceNumber(organizationId: string): Promise<string> {
  const count = await countInvoicesForOrganization(organizationId);
  const year = new Date().getFullYear();
  return `FTR-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * P2002 (organizationId, idempotencyKey) çakışmasından sonra çağrılır. Bu
 * isteğin daha önce işlenmiş bir tekrarı mı, yoksa aynı key'in farklı bir
 * payload ile yeniden kullanımı mı olduğunu ayırt eder. Yeni bir Invoice
 * üretmez.
 */
async function resolveIdempotentReplay(
  organizationId: string,
  idempotencyKey: string,
  requestHash: string | null,
): Promise<CreateInvoiceOutcome> {
  const existing = await findInvoiceByIdempotencyKey(organizationId, idempotencyKey);
  if (!existing) {
    throw new ApiValidationError(
      "Idempotency key conflict detected but the original record could not be found.",
      500,
    );
  }

  if (existing.requestHash !== requestHash) {
    throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);
  }

  return { created: false, invoice: existing };
}

function normalizeCurrency(currency: string | undefined): string {
  const trimmed = currency?.trim().toUpperCase();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CURRENCY;
}

/**
 * quoteId verilmediyse Invoice.quoteId null kalır. Verildiyse: aynı
 * organization'a ve aynı Customer'a ait olmalı — aksi hâlde reddedilir.
 */
async function resolveValidatedQuoteId(
  organizationId: string,
  customerId: string,
  quoteId: string | undefined,
): Promise<string | null> {
  if (!quoteId) return null;

  const quote = await findQuoteByIdForOrganization(quoteId, organizationId);
  if (!quote) {
    throw new ApiValidationError("Quote not found.", 404);
  }

  if (quote.customerId !== customerId) {
    throw new ApiValidationError("Quote belongs to a different customer.", 409);
  }

  return quoteId;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new ApiValidationError(`${fieldName} is required.`);
  }
}

function assertValidAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiValidationError("amount must be a positive number.");
  }
}

function assertValidTaxRate(taxRate: number): void {
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new ApiValidationError("taxRate must be between 0 and 100.");
  }
}
