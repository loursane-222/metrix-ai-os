import { ApiValidationError } from "@/lib/api/validation";
import { getCustomerById } from "@/lib/core/customers/customer.repository";
import { isPersonLinkedToCustomer } from "@/lib/core/customer-contacts/customer-contact.service";
import { findPersonById } from "@/lib/core/people/person.repository";
import { findQuoteByIdForOrganization } from "@/lib/core/quotes/quote.service";
import { computeRequestHash, isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";

import { createPayment, findByIdempotencyKey } from "./payment.repository";
import type { CreatePaymentInput, CreatePaymentOutcome } from "./payment.types";

const DEFAULT_CURRENCY = "TRY";

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

  const normalizedCurrency = normalizeCurrency(input.currency);
  const normalizedDueDate = input.dueDate ? input.dueDate.toISOString() : null;
  const idempotencyKey = input.idempotencyKey ?? null;
  const requestHash = idempotencyKey
    ? computeRequestHash({
        customerId: input.customerId,
        personId,
        quoteId,
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
