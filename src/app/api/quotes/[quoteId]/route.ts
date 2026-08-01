import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { getQuoteWithItemsForOrganization } from "@/lib/core/quotes/quote.service";

function serializeQuote(quote: Awaited<ReturnType<typeof getQuoteWithItemsForOrganization>>) {
  if (!quote) return null;
  return {
    ...quote,
    items: quote.items.map((item) => ({
      ...item,
      quantity: item.quantity.toString(),
      unitPriceCents: item.unitPriceCents.toString(),
      lineTotalCents: item.lineTotalCents.toString(),
    })),
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ quoteId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { quoteId } = await context.params;

    const quote = await getQuoteWithItemsForOrganization(quoteId, authContext.organization.id);
    if (!quote) {
      return fail("Quote not found.", 404);
    }

    return ok({ quote: serializeQuote(quote) });
  } catch (error: unknown) {
    return authFail(error);
  }
}
