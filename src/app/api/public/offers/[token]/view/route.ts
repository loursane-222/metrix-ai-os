import { fail, ok } from "@/lib/api/response";
import { recordPublicOfferView } from "@/lib/core/offers/offer-public-link.service";

const NOT_FOUND = "Teklif bulunamadı.";
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewed = await recordPublicOfferView(token);
  if (!viewed) return fail(NOT_FOUND, 404);
  return ok({ viewed: true });
}
