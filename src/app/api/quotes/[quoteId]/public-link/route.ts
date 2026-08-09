import { fail, ok } from "@/lib/api/response";
import { ApiValidationError } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ensurePublicOfferToken } from "@/lib/core/offers/offer-public-link.service";
import { prisma } from "@/lib/core/shared/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { quoteId } = await params;
    const quote = await prisma.quote.findFirst({ where: { id: quoteId, organizationId: auth.organization.id }, select: { id: true, title: true, amount: true, currency: true, customerId: true, customer: { select: { phone: true } } } });
    if (!quote) return fail("Quote not found.", 404);
    const token = await ensurePublicOfferToken(quote.id, auth.organization.id);
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/u, "");
    const origin = configuredOrigin || new URL(request.url).origin;
    return ok({ publicUrl: `${origin}/teklif/${token}`, organizationName: auth.organization.name, quote: { id: quote.id, title: quote.title, amount: quote.amount?.toString() ?? null, currency: quote.currency, customerId: quote.customerId, customerPhone: quote.customer?.phone ?? null } });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    return authFail(error);
  }
}
