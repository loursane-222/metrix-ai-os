import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalNumber,
  optionalString,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createNewQuote } from "@/lib/core/quotes/quote.service";
import type { QuoteResult } from "@/lib/core/quotes/quote.types";

function serializeQuote(quote: QuoteResult) {
  return quote;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);

    const amount = optionalNumber(body, "amount");
    if (amount !== undefined && amount < 0) {
      return fail("amount must not be negative.", 400);
    }

    const quote = await createNewQuote({
      organizationId: authContext.organization.id,
      customerId: requiredString(body, "customerId"),
      personId: optionalString(body, "personId"),
      title: requiredString(body, "title"),
      amount,
      currency: optionalString(body, "currency"),
      notes: optionalString(body, "notes"),
    });

    return ok({ quote: serializeQuote(quote) }, 201);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, error.status);
    }

    return authFail(error);
  }
}
