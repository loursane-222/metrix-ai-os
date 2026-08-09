import { fail, ok } from "@/lib/api/response";
import { readJsonObject, optionalString } from "@/lib/api/validation";
import { PublicOfferActionError, rejectPublicOffer } from "@/lib/core/offers/offer-public-actions.service";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await readJsonObject(request);
    return ok(await rejectPublicOffer(token, optionalString(body, "reason")));
  } catch (error) {
    if (error instanceof PublicOfferActionError) return fail(error.message, error.status);
    return fail(error instanceof Error && error.name === "ApiValidationError" ? error.message : "Teklif işlemi tamamlanamadı.", 400);
  }
}
