import { Prisma } from "@prisma/client";
import { hashSecret } from "@/lib/auth/shared/crypto";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { prisma } from "@/lib/core/shared/prisma";
import { parseStructuredPaymentTerm, parseTurkishPaymentTerm } from "@/lib/payment-terms";
import { acceptQuoteWithLatestNegotiatedTerms } from "@/lib/core/quotes/quote.service";

const OPEN_STATUSES = ["SENT", "VIEWED", "NEGOTIATION"] as const;
const DECIDED_MESSAGE = "Bu teklif için karar zaten alınmış.";

export class PublicOfferActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PublicOfferActionError";
  }
}

type CounterProposalInput = {
  proposedAmount?: string;
  proposedPaymentTerm?: string;
  proposedPaymentTermStructured?: unknown;
  proposedDeliveryTerm?: string;
  message?: string;
};

function clean(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

async function findPublicQuote(token: string) {
  if (!token.trim()) throw new PublicOfferActionError("Teklif bulunamadı.", 404);
  const quote = await prisma.quote.findFirst({
    where: { publicTokenHash: hashSecret(token) },
    select: { id: true, customerName: true, title: true, status: true, organization: { select: { id: true } } },
  });
  if (!quote) throw new PublicOfferActionError("Teklif bulunamadı.", 404);
  if (!OPEN_STATUSES.includes(quote.status as (typeof OPEN_STATUSES)[number])) throw new PublicOfferActionError(DECIDED_MESSAGE, 409);
  return quote;
}

async function assertUpdated(count: number): Promise<void> {
  if (!count) throw new PublicOfferActionError(DECIDED_MESSAGE, 409);
}

async function notify(input: Parameters<typeof notifyWithOwnerFanout>[0]): Promise<void> {
  try {
    await notifyWithOwnerFanout(input);
  } catch {
    // The action and its QuoteEvent are already durable; notification fanout is best-effort.
  }
}

export async function approvePublicOffer(token: string) {
  const quote = await findPublicQuote(token);
  const approved = await acceptQuoteWithLatestNegotiatedTerms({ quoteId: quote.id, organizationId: quote.organization.id, wonAt: new Date(), eventSource: "USER_CREATED" });
  await assertUpdated(approved ? 1 : 0);
  await notify({ organizationId: quote.organization.id, type: "quote.won", title: `${quote.customerName} teklifi onayladı`, body: `${quote.customerName} teklifi onayladı, siparişe çevirebilirsiniz.`, severity: "INFO", entityType: "Quote", entityId: quote.id });
  return { quoteId: quote.id, status: "WON" as const };
}

export async function rejectPublicOffer(token: string, reason?: string) {
  const quote = await findPublicQuote(token);
  const lostReason = clean(reason) ?? null;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.quote.updateMany({ where: { id: quote.id, status: { in: [...OPEN_STATUSES] } }, data: { status: "LOST", lostAt: new Date(), lostReason } });
    await assertUpdated(updated.count);
    await tx.quoteEvent.create({ data: { organizationId: quote.organization.id, quoteId: quote.id, eventType: "QUOTE_LOST", fromStatus: quote.status, toStatus: "LOST", source: "USER_CREATED", note: lostReason } });
  });
  await notify({ organizationId: quote.organization.id, type: "quote.lost", title: `${quote.customerName} teklifi reddetti`, body: lostReason ? `Müşterinin nedeni: ${lostReason}` : `${quote.title} müşteri tarafından reddedildi.`, severity: "INFO", entityType: "Quote", entityId: quote.id });
  return { quoteId: quote.id, status: "LOST" as const };
}

export async function counterProposePublicOffer(token: string, input: CounterProposalInput) {
  const proposedPaymentTerm = clean(input.proposedPaymentTerm);
  const parsedLegacyTerm = proposedPaymentTerm ? parseTurkishPaymentTerm(proposedPaymentTerm) : null;
  if (parsedLegacyTerm?.status === "CLARIFICATION_REQUIRED") throw new PublicOfferActionError(parsedLegacyTerm.message, 400);
  const proposedPaymentTermStructured = input.proposedPaymentTermStructured !== undefined
    ? parseStructuredPaymentTerm(input.proposedPaymentTermStructured)
    : parsedLegacyTerm?.status === "PARSED" ? parsedLegacyTerm.term : undefined;
  if (input.proposedPaymentTermStructured !== undefined && proposedPaymentTerm !== undefined && (parsedLegacyTerm?.status !== "PARSED" || JSON.stringify(parsedLegacyTerm.term) !== JSON.stringify(proposedPaymentTermStructured))) throw new PublicOfferActionError("Ödeme koşulu metni structured plan ile çelişiyor.", 400);
  const proposedDeliveryTerm = clean(input.proposedDeliveryTerm);
  const message = clean(input.message);
  const amountText = clean(input.proposedAmount);
  let proposedAmount: Prisma.Decimal | undefined;
  if (amountText) {
    try {
      proposedAmount = new Prisma.Decimal(amountText.replace(",", "."));
    } catch {
      throw new PublicOfferActionError("Geçerli bir teklif tutarı girin.", 400);
    }
    if (!proposedAmount.isPositive()) throw new PublicOfferActionError("Teklif tutarı sıfırdan büyük olmalıdır.", 400);
  }
  if (!proposedAmount && !proposedPaymentTerm && !proposedDeliveryTerm && !message) throw new PublicOfferActionError("En az bir karşı teklif alanı doldurun.", 400);

  const quote = await findPublicQuote(token);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.quote.updateMany({ where: { id: quote.id, status: { in: [...OPEN_STATUSES] } }, data: { status: "NEGOTIATION" } });
    await assertUpdated(updated.count);
    await tx.quoteCounterProposal.create({ data: { organizationId: quote.organization.id, quoteId: quote.id, proposedAmount, proposedPaymentTerm, proposedPaymentTermStructured: proposedPaymentTermStructured as unknown as Prisma.InputJsonValue | undefined, proposedDeliveryTerm, message } });
    await tx.quoteEvent.create({ data: { organizationId: quote.organization.id, quoteId: quote.id, eventType: "QUOTE_NEGOTIATION_STARTED", fromStatus: quote.status, toStatus: "NEGOTIATION", source: "USER_CREATED", note: message } });
  });
  const details = [proposedAmount ? `Tutar: ${proposedAmount.toFixed(2)} TRY` : null, proposedPaymentTerm ? `Ödeme: ${proposedPaymentTerm}` : null, proposedDeliveryTerm ? `Teslim: ${proposedDeliveryTerm}` : null, message ? `Mesaj: ${message}` : null].filter(Boolean).join(" · ");
  await notify({ organizationId: quote.organization.id, type: "quote.negotiation", title: `${quote.customerName} karşı teklif verdi`, body: details, severity: "INFO", entityType: "Quote", entityId: quote.id });
  return { quoteId: quote.id, status: "NEGOTIATION" as const };
}
