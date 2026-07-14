import { ApiValidationError } from "@/lib/api/validation";
import { getCustomerById } from "@/lib/core/customers/customer.repository";
import { isPersonLinkedToCustomer } from "@/lib/core/customer-contacts/customer-contact.service";
import { findPersonById } from "@/lib/core/people/person.repository";
import { prisma } from "@/lib/core/shared/prisma";
import { computeRequestHash, isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { logQuoteCreated } from "./quote-event.service";
import {
  createQuote,
  findByIdForOrganization,
  findByIdempotencyKey,
  listByOrganization,
} from "./quote.repository";

import type {
  CreateQuoteInput,
  CreateQuoteOutcome,
  ListQuotesByOrganizationInput,
  QuoteResult,
} from "./quote.types";

const DEFAULT_CURRENCY = "TRY";

export async function createNewQuote(input: CreateQuoteInput): Promise<CreateQuoteOutcome> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.customerId, "customerId");
  assertNonEmpty(input.title, "title");

  const customer = await getCustomerById(input.customerId, input.organizationId);
  if (!customer) {
    throw new ApiValidationError("Customer not found.", 404);
  }

  const personId = await resolveValidatedPersonId(
    input.organizationId,
    input.customerId,
    input.personId,
  );

  const normalizedCurrency = normalizeCurrency(input.currency);
  const idempotencyKey = input.idempotencyKey ?? null;
  const requestHash = idempotencyKey
    ? computeRequestHash({
        customerId: input.customerId,
        personId,
        title: input.title,
        amount: input.amount ?? null,
        currency: normalizedCurrency,
        notes: input.notes ?? null,
      })
    : null;

  try {
    const quote = await prisma.$transaction(async (tx) => {
      const created = await createQuote(
        {
          organizationId: input.organizationId,
          customerId: input.customerId,
          personId,
          customerName: customer.displayName,
          title: input.title,
          amount: input.amount,
          currency: normalizedCurrency,
          notes: input.notes,
          idempotencyKey,
          requestHash,
        },
        tx,
      );

      await logQuoteCreated(
        {
          organizationId: input.organizationId,
          quoteId: created.id,
          source: "USER_CREATED",
        },
        tx,
      );

      return created;
    });

    return { created: true, quote };
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
 * farklı bir payload ile yeniden kullanımı mı olduğunu ayırt eder.
 */
async function resolveIdempotentReplay(
  organizationId: string,
  idempotencyKey: string,
  requestHash: string | null,
): Promise<CreateQuoteOutcome> {
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

  return { created: false, quote: existing };
}

function normalizeCurrency(currency: string | undefined): string {
  const trimmed = currency?.trim().toUpperCase();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CURRENCY;
}

export async function listQuotesByOrganization(
  input: ListQuotesByOrganizationInput,
): Promise<QuoteResult[]> {
  assertNonEmpty(input.organizationId, "organizationId");

  return listByOrganization(input);
}

export async function findQuoteByIdForOrganization(
  id: string,
  organizationId: string,
): Promise<QuoteResult | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return findByIdForOrganization(id, organizationId);
}

/**
 * personId verilmediyse Quote.personId null kalır (Person zorunlu değil).
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

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}
