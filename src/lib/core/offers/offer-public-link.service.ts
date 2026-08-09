import { ApiValidationError } from "@/lib/api/validation";
import { generateSecureToken, hashSecret } from "@/lib/auth/shared/crypto";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { prisma } from "@/lib/core/shared/prisma";

const publicOfferSelect = {
  id: true, title: true, customerName: true, amount: true, currency: true, customerNote: true,
  validUntil: true, paymentTerm: true, deliveryTerm: true, deliveryMethod: true,
  organization: { select: { name: true } },
  items: { select: { id: true, name: true, unit: true, quantity: true, unitPriceCents: true, discountBasisPoints: true, vatRateBasisPoints: true, lineTotalCents: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } },
} as const;

export async function ensurePublicOfferToken(quoteId: string, organizationId: string): Promise<string> {
  if (!quoteId.trim() || !organizationId.trim()) throw new ApiValidationError("quoteId and organizationId are required.");
  const token = generateSecureToken();
  const updated = await prisma.quote.updateMany({ where: { id: quoteId, organizationId }, data: { publicTokenHash: hashSecret(token), publicTokenCreatedAt: new Date() } });
  if (!updated.count) throw new ApiValidationError("Quote not found.", 404);
  return token;
}

export async function getPublicOfferByToken(token: string) {
  if (!token.trim()) return null;
  return prisma.quote.findFirst({ where: { publicTokenHash: hashSecret(token) }, select: publicOfferSelect });
}

export async function recordPublicOfferView(token: string) {
  if (!token.trim()) return null;
  const tokenHash = hashSecret(token);
  const viewed = await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({ where: { publicTokenHash: tokenHash }, select: { id: true, organizationId: true, customerName: true, title: true, status: true } });
    if (!quote) return null;
    const nextStatus = quote.status === "SENT" ? "VIEWED" : quote.status;
    await tx.quote.update({ where: { id: quote.id, organizationId: quote.organizationId }, data: { viewedAt: new Date(), status: nextStatus } });
    await tx.quoteEvent.create({ data: { organizationId: quote.organizationId, quoteId: quote.id, eventType: "QUOTE_VIEWED", fromStatus: quote.status, toStatus: nextStatus, source: "USER_CREATED" } });
    return quote;
  });
  if (!viewed) return null;
  try {
    await notifyWithOwnerFanout({ organizationId: viewed.organizationId, type: "quote.viewed", title: `${viewed.customerName} teklifinizi görüntüledi`, body: `${viewed.title} genel teklif bağlantısından görüntülendi.`, severity: "INFO", entityType: "Quote", entityId: viewed.id });
  } catch {
    // The canonical QuoteEvent and viewedAt are already durable; notification fanout is best-effort.
  }
  return { quoteId: viewed.id };
}

export function serializePublicOffer(offer: NonNullable<Awaited<ReturnType<typeof getPublicOfferByToken>>>) {
  return {
    id: offer.id, title: offer.title, customerName: offer.customerName, amount: offer.amount?.toString() ?? null,
    currency: offer.currency, customerNote: offer.customerNote, validUntil: offer.validUntil?.toISOString() ?? null,
    paymentTerm: offer.paymentTerm, deliveryTerm: offer.deliveryTerm, deliveryMethod: offer.deliveryMethod,
    organizationName: offer.organization.name,
    items: offer.items.map((item) => ({ ...item, quantity: item.quantity.toString(), unitPriceCents: item.unitPriceCents.toString(), lineTotalCents: item.lineTotalCents.toString() })),
  };
}
