import { fail, ok } from "@/lib/api/response";
import { approvePublicOffer, PublicOfferActionError } from "@/lib/core/offers/offer-public-actions.service";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    return ok(await approvePublicOffer(token));
  } catch (error) {
    if (error instanceof PublicOfferActionError) return fail(error.message, error.status);
    return fail("Teklif işlemi tamamlanamadı.", 500);
  }
}
