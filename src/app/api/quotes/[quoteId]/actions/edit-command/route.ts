import { ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveOfferEditCommand } from "@/lib/offers/offer-edit-command-resolver";
import { generateOfferEditCommandText } from "@/lib/offers/offer-edit-command-ai-adapter";

export const maxDuration = 60;

/**
 * Offer Edit Command Resolution için tek, dar server sınırı — bkz.
 * customers/[customerId]/actions/edit-command/route.ts aynı desen. Hiçbir
 * veri değiştirmez, hiçbir domain action çalıştırmaz; uygulama tamamen
 * client'ta (browser-local command channel üzerinden) gerçekleşir.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
): Promise<Response> {
  try {
    await requireAuthContextFromCookies();
    await context.params;

    const body = await readJsonObject(request);
    const utterance = requiredString(body, "utterance");
    const activeTab = requiredString(body, "activeTab");

    const outcome = await resolveOfferEditCommand({
      utterance,
      activeTab,
      generateText: generateOfferEditCommandText,
    });

    return ok({ outcome });
  } catch (error: unknown) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
