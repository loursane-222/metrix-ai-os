import { ApiValidationError } from "@/lib/api/validation";
import { getCustomerById } from "@/lib/core/customers/customer.repository";
import { isPersonLinkedToCustomer } from "@/lib/core/customer-contacts/customer-contact.service";
import { findPersonById } from "@/lib/core/people/person.repository";
import { findQuoteByIdForOrganization } from "@/lib/core/quotes/quote.service";
import { computeRequestHash, isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import { recordPaymentPaid } from "@/lib/accounting/ledger.service";
import { findInvoiceById } from "@/lib/core/invoices/invoice.repository";

import {
  applyPaymentAmount as applyPaymentAmountRepository,
  createPayment,
  findByIdempotencyKey,
  findPaymentByIdForOrganization,
  listPaymentsForOrganization,
  reconcileOverdueStatuses,
} from "./payment.repository";
import type { ApplyPaymentInput, ApplyPaymentOutcome, CreatePaymentInput, CreatePaymentOutcome, PaymentResult } from "./payment.types";

const DEFAULT_CURRENCY = "TRY";
const AMOUNT_EPSILON = 0.005;

export async function listPayments(organizationId: string): Promise<PaymentResult[]> {
  assertNonEmpty(organizationId, "organizationId");
  await reconcileOverdueStatuses(organizationId);
  return listPaymentsForOrganization(organizationId);
}

export async function findPaymentById(paymentId: string, organizationId: string): Promise<PaymentResult | null> { return findPaymentByIdForOrganization(paymentId, organizationId); }

export { reconcileOverdueStatuses };

export async function createNewPayment(input: CreatePaymentInput): Promise<CreatePaymentOutcome> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.customerId, "customerId");
  assertNonEmpty(input.title, "title");
  assertValidAmount(input.amount);

  const customer = await getCustomerById(input.customerId, input.organizationId);
  if (!customer) {
    throw new ApiValidationError("Customer not found.", 404);
  }

  const personId = await resolveValidatedPersonId(
    input.organizationId,
    input.customerId,
    input.personId,
  );

  const quoteId = await resolveValidatedQuoteId(
    input.organizationId,
    input.customerId,
    input.quoteId,
  );
  const invoiceId = await resolveValidatedInvoiceId(input.organizationId, input.customerId, input.invoiceId);

  const normalizedCurrency = normalizeCurrency(input.currency);
  const normalizedDueDate = input.dueDate ? input.dueDate.toISOString() : null;
  const idempotencyKey = input.idempotencyKey ?? null;
  const requestHash = idempotencyKey
    ? computeRequestHash({
        customerId: input.customerId,
        personId,
        quoteId,
        invoiceId,
        title: input.title,
        amount: input.amount,
        currency: normalizedCurrency,
        dueDate: normalizedDueDate,
        notes: input.notes ?? null,
      })
    : null;

  try {
    const payment = await createPayment({
      organizationId: input.organizationId,
      customerId: input.customerId,
      personId,
      quoteId,
      invoiceId,
      title: input.title,
      amount: input.amount,
      currency: normalizedCurrency,
      dueDate: input.dueDate,
      notes: input.notes,
      idempotencyKey,
      requestHash,
    });

    return { created: true, payment };
  } catch (error) {
    if (idempotencyKey && isIdempotencyKeyCollision(error)) {
      return resolveIdempotentReplay(input.organizationId, idempotencyKey, requestHash);
    }

    throw error;
  }
}

/**
 * Var olan bir Payment'a kısmi/tam tahsilat uygular. paymentId bulunamazsa
 * (organizasyon dışı dahil) null döner — 404 üretmek çağıranın işidir.
 * Kalan bakiyeden fazla tutar veya zaten PAID/CANCELLED bir kayda uygulama
 * denemesi ApiValidationError ile reddedilir; sessizce üst üste yazılmaz.
 */
export async function applyPaymentAmount(input: ApplyPaymentInput): Promise<ApplyPaymentOutcome | null> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.paymentId, "paymentId");
  assertValidAmount(input.amount);

  return prisma.$transaction(async (tx) => {
    const payment = await findPaymentByIdForOrganization(input.paymentId, input.organizationId, tx);
    if (!payment) return null;

    if (payment.status === "PAID" || payment.status === "CANCELLED") {
      throw new ApiValidationError(`Payment is already ${payment.status}.`, 409);
    }

    const currentPaid = Number(payment.paidAmount);
    const total = Number(payment.amount);
    const remaining = total - currentPaid;

    if (input.amount > remaining + AMOUNT_EPSILON) {
      throw new ApiValidationError("amount exceeds the remaining payment balance.", 409);
    }

    const newPaidAmount = Math.min(currentPaid + input.amount, total);
    const isFullyPaid = total - newPaidAmount <= AMOUNT_EPSILON;
    const paidAt = isFullyPaid ? new Date() : null;
    const updated = await applyPaymentAmountRepository({ id: input.paymentId, organizationId: input.organizationId, paidAmount: newPaidAmount, status: isFullyPaid ? "PAID" : "PARTIAL", paidAt }, tx);
    if (updated && isFullyPaid && paidAt) {
      await recordPaymentPaid({ tx, organizationId: input.organizationId, paymentId: updated.id, entryDate: paidAt, amount: updated.amount, currency: updated.currency });
    }
    if (updated?.invoiceId) {
      const invoice = await findInvoiceById(updated.invoiceId, input.organizationId, tx);
      if (invoice) {
        const paid = await tx.payment.aggregate({ where: { invoiceId: invoice.id }, _sum: { paidAmount: true } });
        const paidTotal = Number(paid._sum.paidAmount ?? 0);
        if (paidTotal >= Number(invoice.totalAmount) - AMOUNT_EPSILON) {
          await tx.invoice.updateMany({ where: { id: invoice.id, organizationId: input.organizationId, status: { not: "PAID" } }, data: { status: "PAID" } });
        }
      }
    }
    return updated ? { payment: updated } : null;
  });
}

/**
 * P2002 (organizationId, idempotencyKey) çakışmasından sonra çağrılır.
 * Bu istek gerçekten daha önce işlenmiş bir tekrar mı, yoksa aynı key'in
 * farklı bir payload ile yeniden kullanımı mı olduğunu ayırt eder. Yeni bir
 * Payment veya yan etki (CollectionAction) üretmez.
 */
async function resolveIdempotentReplay(
  organizationId: string,
  idempotencyKey: string,
  requestHash: string | null,
): Promise<CreatePaymentOutcome> {
  const existing = await findByIdempotencyKey(organizationId, idempotencyKey);
  if (!existing) {
    throw new ApiValidationError(
      "Idempotency key conflict detected but the original record could not be found.",
      500,
    );
  }

  if (existing.requestHash !== requestHash) {
    throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);
  }

  return { created: false, payment: existing };
}

function normalizeCurrency(currency: string | undefined): string {
  const trimmed = currency?.trim().toUpperCase();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CURRENCY;
}

/**
 * personId verilmediyse Payment.personId null kalır (Person zorunlu değil).
 * Verildiyse: aynı organization'a ait olmalı ve seçilen Customer'a
 * CustomerContact üzerinden bağlı olmalı — aksi hâlde reddedilir.
 */
async function resolveValidatedPersonId(
  organizationId: string,
  customerId: string,
  personId: string | undefined,
): Promise<string | null> {
  if (!personId) return null;

  const person = await findPersonById(personId, organizationId);
  if (!person) {
    throw new ApiValidationError("Person not found.", 404);
  }

  const linked = await isPersonLinkedToCustomer(organizationId, customerId, personId);
  if (!linked) {
    throw new ApiValidationError("Person is not linked to this customer.", 409);
  }

  return personId;
}

/**
 * quoteId verilmediyse Payment.quoteId null kalır. Verildiyse: aynı
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

async function resolveValidatedInvoiceId(
  organizationId: string,
  customerId: string,
  invoiceId: string | undefined,
): Promise<string | null> {
  if (!invoiceId) return null;
  const invoice = await findInvoiceById(invoiceId, organizationId);
  if (!invoice) throw new ApiValidationError("Invoice not found.", 404);
  if (invoice.customerId !== customerId) throw new ApiValidationError("Invoice belongs to a different customer.", 409);
  return invoiceId;
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
