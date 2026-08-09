import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { computeCustomerDecisionScorecard, computeOfferIntelligence } from "@/lib/core/offers/offer-intelligence.service";
import { prisma } from "@/lib/core/shared/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  try {
    const auth = await requireAuthContextFromCookies();
    const { quoteId } = await params;
    const quote = await prisma.quote.findFirst({ where: { id: quoteId, organizationId: auth.organization.id }, select: { id: true, customerId: true } });
    if (!quote) return fail("Teklif bulunamadı.", 404);
    const [intelligence, customerScorecard] = await Promise.all([
      computeOfferIntelligence(quote.id, auth.organization.id),
      quote.customerId ? computeCustomerDecisionScorecard(quote.customerId, auth.organization.id) : Promise.resolve(null),
    ]);
    return ok({ intelligence, customerScorecard });
  } catch (error) {
    return authFail(error);
  }
}
