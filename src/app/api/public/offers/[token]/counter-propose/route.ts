import { fail, ok } from "@/lib/api/response";
import { optionalString, readJsonObject } from "@/lib/api/validation";
import { counterProposePublicOffer, PublicOfferActionError } from "@/lib/core/offers/offer-public-actions.service";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await readJsonObject(request);
    return ok(await counterProposePublicOffer(token, {
      proposedAmount: optionalString(body, "proposedAmount"),
      proposedPaymentTerm: optionalString(body, "proposedPaymentTerm"),
      proposedDeliveryTerm: optionalString(body, "proposedDeliveryTerm"),
      message: optionalString(body, "message"),
    }));
  } catch (error) {
    if (error instanceof PublicOfferActionError) return fail(error.message, error.status);
    return fail(error instanceof Error && error.name === "ApiValidationError" ? error.message : "Teklif işlemi tamamlanamadı.", 400);
  }
}
