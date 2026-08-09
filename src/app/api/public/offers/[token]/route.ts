import { fail, ok } from "@/lib/api/response";
import { getPublicOfferByToken, serializePublicOffer } from "@/lib/core/offers/offer-public-link.service";

const NOT_FOUND = "Teklif bulunamadı.";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const offer = await getPublicOfferByToken(token);
  if (!offer) return fail(NOT_FOUND, 404);
  return ok({ offer: serializePublicOffer(offer) });
}
