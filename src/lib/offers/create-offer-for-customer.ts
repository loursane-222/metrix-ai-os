import { getCustomer } from "@/lib/customers/customers-client";
import { createOffer } from "./quotes-client";

/**
 * Shared by OfferCreateRedirect (route presentation, /metrix/offers/create/[customerId])
 * and OfferCreateScreen (Living Workspace inline presentation) so the DRAFT-quote
 * creation behavior for a pre-selected customer stays in one place.
 */
export async function createOfferForCustomer(
  customerId: string,
): Promise<{ ok: true; quoteId: string } | { ok: false; error: string }> {
  const customerResult = await getCustomer(customerId);
  if (!customerResult.ok) return { ok: false, error: customerResult.error };

  const offerResult = await createOffer({
    customerId,
    title: `${customerResult.data.customer.displayName} Teklifi`,
  });
  if (!offerResult.ok) return { ok: false, error: offerResult.error };

  return { ok: true, quoteId: offerResult.data.quote.id };
}
