import { ApiValidationError } from "@/lib/api/validation";
import { getCustomerById } from "@/lib/core/customers/customer.repository";
import { isPersonLinkedToCustomer } from "@/lib/core/customer-contacts/customer-contact.service";
import { findPersonById } from "@/lib/core/people/person.repository";
import { prisma } from "@/lib/core/shared/prisma";
import { computeRequestHash, isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { logQuoteCreated, logQuoteDispatched, logQuoteSent } from "./quote-event.service";
import { notify } from "@/lib/core/notifications/notification.service";
import { sendTransactionalEmail } from "@/lib/core/email/resend-provider";
import { buildQuoteDispatchEmailContent } from "./quote-dispatch-email";
import {
  createQuote,
  findByIdForOrganization,
  findByIdForOrganizationWithItems,
  findByIdempotencyKey,
  listByOrganization,
  recordQuoteDispatch,
  updateQuoteCommercialFields,
  updateQuoteLifecycle,
} from "./quote.repository";
import { createQuoteItem, listQuoteItems } from "./quote-item.repository";
import { computeQuoteTotalCents, centsToAmount } from "./quote-totals";
import { parseStructuredPaymentTerm, parseTurkishPaymentTerm, resolvePaymentTermPrecedence, validatePaymentTermForDocument } from "@/lib/payment-terms";
import type { StructuredPaymentTerm } from "@/lib/payment-terms";

import type {
  CreateQuoteInput,
  CreateQuoteOutcome,
  ListQuotesByOrganizationInput,
  QuoteResult,
  QuoteWithItems,
} from "./quote.types";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

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
  const paymentTermStructured = input.paymentTermStructured
    ? parseStructuredPaymentTerm(input.paymentTermStructured)
    : await resolveCustomerDefaultPaymentTerm(input.customerId, input.organizationId);
  if (paymentTermStructured && input.amount && input.amount > 0) validatePaymentTermForDocument(paymentTermStructured, BigInt(Math.round(input.amount * 100)), normalizedCurrency);
  const idempotencyKey = input.idempotencyKey ?? null;
  const requestHash = idempotencyKey
    ? computeRequestHash({
        customerId: input.customerId,
        personId,
        title: input.title,
        amount: input.amount ?? null,
        currency: normalizedCurrency,
        notes: input.notes ?? null,
        paymentTermStructured,
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
          paymentTermStructured,
          idempotencyKey,
          requestHash,
          createdByUserId: input.createdByUserId,
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

export async function getQuoteWithItemsForOrganization(
  id: string,
  organizationId: string,
): Promise<QuoteWithItems | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");
  return findByIdForOrganizationWithItems(id, organizationId);
}

/** Seller-side WON resolution: the latest counterproposal is the accepted negotiation snapshot. */
export async function acceptQuoteWithLatestNegotiatedTerms(input: { quoteId: string; organizationId: string; wonAt: Date }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({ where: { id: input.quoteId, organizationId: input.organizationId }, select: { status: true } });
    if (!quote) return false;
    const proposal = quote.status === "NEGOTIATION" ? await tx.quoteCounterProposal.findFirst({ where: { quoteId: input.quoteId, organizationId: input.organizationId }, orderBy: { createdAt: "desc" } }) : null;
    const structured = proposal?.proposedPaymentTermStructured ? parseStructuredPaymentTerm(proposal.proposedPaymentTermStructured) : undefined;
    const result = await tx.quote.updateMany({
      where: { id: input.quoteId, organizationId: input.organizationId },
      data: {
        status: "WON",
        wonAt: input.wonAt,
        ...(proposal?.proposedPaymentTerm !== null && proposal?.proposedPaymentTerm !== undefined ? { paymentTerm: proposal.proposedPaymentTerm } : {}),
        ...(structured ? { paymentTermStructured: structured as unknown as import("@prisma/client").Prisma.InputJsonValue } : {}),
      },
    });
    return result.count === 1;
  });
}

/** Recomputes Quote.amount from its current items + general discount and persists it. */
async function recomputeAndPersistTotal(
  quoteId: string,
  organizationId: string,
  tx: PrismaTransactionClient,
): Promise<void> {
  const quote = await tx.quote.findFirst({ where: { id: quoteId, organizationId } });
  if (!quote) throw new ApiValidationError("Quote not found.", 404);

  const items = await listQuoteItems(quoteId, organizationId, tx);
  const totalCents = computeQuoteTotalCents(
    items.map((item) => item.lineTotalCents),
    quote.generalDiscountBasisPoints,
  );

  await updateQuoteCommercialFields({ id: quoteId, organizationId, amount: centsToAmount(totalCents) }, tx);
}

export type QuoteItemPatchLine = {
  productServiceId?: string | null;
  name: string;
  unit?: string | null;
  quantity: number;
  unitPriceCents: number;
  discountBasisPoints?: number;
  vatRateBasisPoints?: number;
};

/**
 * quote.update's full allowed field set — mirrors CustomerUpdatePatch: `items`,
 * when present, is the *complete* replacement line-item set (same replace-on-
 * commit semantics Customer uses for customFields), never an incremental
 * add/remove. The Offer Edit draft holds the whole array client-side and
 * every conversational item command (add/remove/reprice) mutates it in
 * memory; only commit() reaches this function.
 */
export type UpdateQuoteInput = {
  id: string;
  organizationId: string;
  expectedUpdatedAt: Date;
  items?: QuoteItemPatchLine[];
  generalDiscountBasisPoints?: number | null;
  customerNote?: string | null;
  specialTerms?: string | null;
  validUntil?: Date | null;
  paymentTerm?: string | null;
  paymentTermStructured?: StructuredPaymentTerm | null;
  deliveryTerm?: string | null;
  deliveryMethod?: string | null;
};

export type UpdateQuoteVersionGuardResult =
  | { outcome: "NOT_FOUND" }
  | { outcome: "VERSION_CONFLICT" }
  | { outcome: "NO_CHANGE"; quote: QuoteWithItems }
  | { outcome: "UPDATED"; quote: QuoteWithItems; previous: QuoteResult };

export async function updateQuoteWithVersionGuard(input: UpdateQuoteInput): Promise<UpdateQuoteVersionGuardResult> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");

  if (input.items) {
    for (const item of input.items) {
      if (!item.name.trim()) throw new ApiValidationError("item name is required.", 400);
      if (item.quantity <= 0) throw new ApiValidationError("item quantity must be positive.", 400);
      if (item.unitPriceCents < 0) throw new ApiValidationError("item unitPriceCents must not be negative.", 400);
    }
  }
  if (
    input.generalDiscountBasisPoints != null &&
    (input.generalDiscountBasisPoints < 0 || input.generalDiscountBasisPoints > 10_000)
  ) {
    throw new ApiValidationError("generalDiscountBasisPoints must be between 0 and 10000.", 400);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
    if (!existing) return { outcome: "NOT_FOUND" };
    if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return { outcome: "VERSION_CONFLICT" };

    const hasChange =
      input.items !== undefined ||
      input.generalDiscountBasisPoints !== undefined ||
      input.customerNote !== undefined ||
      input.specialTerms !== undefined ||
      input.validUntil !== undefined ||
      input.paymentTerm !== undefined ||
      input.paymentTermStructured !== undefined ||
      input.deliveryTerm !== undefined ||
      input.deliveryMethod !== undefined;

    if (!hasChange) {
      const unchanged = await findByIdForOrganizationWithItems(input.id, input.organizationId, tx);
      if (!unchanged) return { outcome: "NOT_FOUND" };
      return { outcome: "NO_CHANGE", quote: unchanged };
    }

    if (existing.status !== "DRAFT" && existing.status !== "NEGOTIATION") {
      throw new ApiValidationError("Only draft or negotiation quotes can be edited.", 409);
    }

    const structuredTerm = resolveQuoteUpdatePaymentTerm(input.paymentTerm, input.paymentTermStructured);
    if (structuredTerm && existing.amount) validatePaymentTermForDocument(structuredTerm, BigInt(Math.round(Number(existing.amount) * 100)), existing.currency);

    if (input.items !== undefined) {
      await tx.quoteItem.deleteMany({ where: { quoteId: input.id, organizationId: input.organizationId } });
      let sortOrder = 0;
      for (const line of input.items) {
        await createQuoteItem(
          {
            organizationId: input.organizationId,
            quoteId: input.id,
            productServiceId: line.productServiceId ?? null,
            name: line.name,
            unit: line.unit ?? null,
            quantity: line.quantity,
            unitPriceCents: BigInt(Math.round(line.unitPriceCents)),
            discountBasisPoints: line.discountBasisPoints ?? 0,
            vatRateBasisPoints: line.vatRateBasisPoints ?? 0,
            sortOrder: sortOrder++,
          },
          tx,
        );
      }
    }

    await updateQuoteCommercialFields(
      {
        id: input.id,
        organizationId: input.organizationId,
        ...(input.generalDiscountBasisPoints !== undefined ? { generalDiscountBasisPoints: input.generalDiscountBasisPoints } : {}),
        ...(input.customerNote !== undefined ? { customerNote: input.customerNote } : {}),
        ...(input.specialTerms !== undefined ? { specialTerms: input.specialTerms } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
        ...(input.paymentTerm !== undefined ? { paymentTerm: input.paymentTerm } : {}),
        ...(structuredTerm !== undefined ? { paymentTermStructured: structuredTerm } : {}),
        ...(input.deliveryTerm !== undefined ? { deliveryTerm: input.deliveryTerm } : {}),
        ...(input.deliveryMethod !== undefined ? { deliveryMethod: input.deliveryMethod } : {}),
      },
      tx,
    );

    await recomputeAndPersistTotal(input.id, input.organizationId, tx);

    const updated = await findByIdForOrganizationWithItems(input.id, input.organizationId, tx);
    if (!updated) return { outcome: "NOT_FOUND" };
    return { outcome: "UPDATED", quote: updated, previous: existing };
  });
}

function resolveQuoteUpdatePaymentTerm(legacyText: string | null | undefined, explicit: StructuredPaymentTerm | null | undefined): StructuredPaymentTerm | null | undefined {
  const explicitTerm = explicit === undefined || explicit === null ? explicit : parseStructuredPaymentTerm(explicit);
  if (legacyText === undefined) return explicitTerm;
  if (legacyText === null || !legacyText.trim()) return explicitTerm ?? null;
  const parsedText = parseTurkishPaymentTerm(legacyText);
  if (parsedText.status === "CLARIFICATION_REQUIRED") throw new ApiValidationError(parsedText.message, 400);
  if (explicitTerm) {
    if (parsedText.status !== "PARSED" || JSON.stringify(parsedText.term) !== JSON.stringify(explicitTerm)) throw new ApiValidationError("paymentTerm text conflicts with paymentTermStructured.", 400);
    return explicitTerm;
  }
  return parsedText.status === "PARSED" ? parsedText.term : null;
}

async function resolveCustomerDefaultPaymentTerm(customerId: string, organizationId: string): Promise<StructuredPaymentTerm | undefined> {
  const delegate = (prisma as typeof prisma & { customerCommercialTerms?: typeof prisma.customerCommercialTerms }).customerCommercialTerms;
  if (!delegate) return undefined;
  const terms = await delegate.findFirst({ where: { customerId, organizationId }, select: { paymentTermStructured: true, paymentTermDays: true } });
  return resolvePaymentTermPrecedence({ customerDefaultTerm: terms?.paymentTermStructured, customerDefaultDays: terms?.paymentTermDays });
}

export type SendQuoteResult = { quote: QuoteResult };

/**
 * The real production dispatch boundary for "Teklifi müşteriye gönder":
 * transitions DRAFT -> SENT, stamps sentAt, logs the QuoteEvent, and raises
 * an in-app Notification via the canonical notify() authority. There is no
 * external (email/SMS) delivery channel wired into METRIX yet — that is a
 * separate, explicit integration decision, not something this action fakes.
 */
export async function sendQuoteToCustomer(input: {
  quoteId: string;
  organizationId: string;
  actorId: string;
  conversationId?: string | null;
}): Promise<SendQuoteResult> {
  assertNonEmpty(input.quoteId, "quoteId");
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.actorId, "actorId");

  const quote = await prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findFirst({ where: { id: input.quoteId, organizationId: input.organizationId } });
    if (!existing) throw new ApiValidationError("Quote not found.", 404);
    if (existing.status !== "DRAFT" && existing.status !== "NEGOTIATION") {
      throw new ApiValidationError("Only draft or negotiation quotes can be sent.", 409);
    }

    const items = await listQuoteItems(input.quoteId, input.organizationId, tx);
    if (items.length === 0) throw new ApiValidationError("Boş teklif gönderilemez.", 409);

    const ok = await updateQuoteLifecycle({ id: input.quoteId, organizationId: input.organizationId, status: "SENT", sentAt: new Date() }, tx);
    if (!ok) throw new ApiValidationError("Quote not found.", 404);

    await logQuoteSent({ organizationId: input.organizationId, quoteId: input.quoteId, conversationId: input.conversationId });

    return tx.quote.findFirstOrThrow({ where: { id: input.quoteId, organizationId: input.organizationId } });
  });

  // Non-critical side effect — mirrors task-create-handler's convention:
  // the quote is already sent server-side by this point, so a notification
  // delivery failure must never surface as a failed send.
  try {
    await notify({
      organizationId: input.organizationId,
      recipientUserId: input.actorId,
      type: "quote.sent",
      title: `${quote.customerName} teklifi gönderildi`,
      body: `${quote.title} teklifi ${quote.customerName} müşterisine gönderildi.`,
      severity: "INFO",
      entityType: "Quote",
      entityId: quote.id,
    });
  } catch {
    // Recorded via the SENT status/QuoteEvent already persisted above; notification delivery is best-effort.
  }

  return { quote };
}

export type DispatchQuoteResult =
  | { outcome: "DISPATCHED"; quote: QuoteResult; recipientEmail: string; providerMessageId: string | null }
  | { outcome: "NOT_SENT" }
  | { outcome: "MISSING_RECIPIENT_EMAIL" }
  | { outcome: "PROVIDER_FAILED"; error: string };

/**
 * The real external dispatch boundary: sends the actual "Teklif" email to
 * the quote's customer via the canonical sendTransactionalEmail() provider
 * (Resend, verified metrixgm.com sending domain — the same approved
 * provider identity OTP delivery already uses). Requires the quote to
 * already be SENT (quote.send has run) and the linked customer to have a
 * real email on file — never invents a recipient, never fabricates success.
 */
export async function dispatchQuoteToCustomerEmail(input: {
  quoteId: string;
  organizationId: string;
  actorId: string;
}): Promise<DispatchQuoteResult> {
  assertNonEmpty(input.quoteId, "quoteId");
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.actorId, "actorId");

  const quote = await findByIdForOrganization(input.quoteId, input.organizationId);
  if (!quote) throw new ApiValidationError("Quote not found.", 404);
  if (quote.status === "DRAFT" || quote.status === "NEGOTIATION") {
    return { outcome: "NOT_SENT" };
  }
  if (!quote.customerId) {
    return { outcome: "MISSING_RECIPIENT_EMAIL" };
  }

  const customer = await getCustomerById(quote.customerId, input.organizationId);
  const recipientEmail = customer?.email?.trim();
  if (!recipientEmail) {
    return { outcome: "MISSING_RECIPIENT_EMAIL" };
  }

  const content = buildQuoteDispatchEmailContent(quote);
  let providerMessageId: string | null;
  try {
    const result = await sendTransactionalEmail({ to: recipientEmail, subject: content.subject, html: content.html, text: content.text });
    providerMessageId = result.providerMessageId;
  } catch (error) {
    return { outcome: "PROVIDER_FAILED", error: error instanceof Error ? error.message : "Unknown provider failure." };
  }

  await recordQuoteDispatch({ id: input.quoteId, organizationId: input.organizationId, recipientEmail, providerMessageId, dispatchedAt: new Date() });
  await logQuoteDispatched({ organizationId: input.organizationId, quoteId: input.quoteId, recipientEmail, providerMessageId });

  try {
    await notify({
      organizationId: input.organizationId,
      recipientUserId: input.actorId,
      type: "quote.dispatched",
      title: `${quote.customerName} teklifi e-posta ile gönderildi`,
      body: `${quote.title} teklifi ${recipientEmail} adresine gönderildi.`,
      severity: "INFO",
      entityType: "Quote",
      entityId: quote.id,
    });
  } catch {
    // Best-effort — dispatch itself already succeeded and is recorded above.
  }

  return { outcome: "DISPATCHED", quote, recipientEmail, providerMessageId };
}
