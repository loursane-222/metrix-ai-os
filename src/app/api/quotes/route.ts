import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalIdempotencyKey,
  optionalNumber,
  optionalString,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createNewQuote, listQuotesByOrganization } from "@/lib/core/quotes/quote.service";
import type { QuoteResult } from "@/lib/core/quotes/quote.types";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";
import type { QuoteStatus } from "@prisma/client";

const QUOTE_STATUS_VALUES: readonly QuoteStatus[] = ["DRAFT", "SENT", "VIEWED", "NEGOTIATION", "WON", "LOST", "CANCELLED"];

function serializeQuote(quote: QuoteResult) {
  return quote;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const statusParam = new URL(request.url).searchParams.get("status");
    if (statusParam !== null && !QUOTE_STATUS_VALUES.includes(statusParam as QuoteStatus)) {
      return fail("status is not a valid quote status.", 400);
    }
    const status = statusParam as QuoteStatus | null;

    const quotes = await listQuotesByOrganization({
      organizationId: authContext.organization.id,
      ...(status ? { status } : {}),
    });

    return ok({ quotes: quotes.map(serializeQuote) });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const idempotencyKey = optionalIdempotencyKey(request);
    const security = await authorizeLegacyMutation({ authContext, actionName: "quote.create", requiredPermission: "quotes.write", entityType: "Quote", idempotencyKey });
    const body = await readJsonObject(request);

    const amount = optionalNumber(body, "amount");
    if (amount !== undefined && amount < 0) {
      return fail("amount must not be negative.", 400);
    }

    const outcome = await createNewQuote({
      organizationId: authContext.organization.id,
      customerId: requiredString(body, "customerId"),
      personId: optionalString(body, "personId"),
      title: requiredString(body, "title"),
      amount,
      currency: optionalString(body, "currency"),
      notes: optionalString(body, "notes"),
      idempotencyKey,
    });
    await security.succeed(outcome.quote.id, outcome.created ? "SUCCEEDED" : "NO_CHANGE");

    return ok({ quote: serializeQuote(outcome.quote) }, outcome.created ? 201 : 200);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, error.status);
    }

    return authFail(error);
  }
}
