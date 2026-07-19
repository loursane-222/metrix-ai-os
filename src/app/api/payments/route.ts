import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalIdempotencyKey,
  optionalString,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createNewPayment } from "@/lib/core/payments/payment.service";
import type { PaymentResult } from "@/lib/core/payments/payment.types";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";

function serializePayment(payment: PaymentResult) {
  return payment;
}

function readAmount(body: Record<string, unknown>): number {
  const value = body["amount"];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiValidationError("amount is required and must be a number.");
  }

  return value;
}

function readOptionalDate(body: Record<string, unknown>, key: string): Date | undefined {
  const value = optionalString(body, key);
  if (value === undefined) return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiValidationError(`${key} must be a valid date.`);
  }

  return parsed;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const idempotencyKey = optionalIdempotencyKey(request);
    const security = authorizeLegacyMutation({ authContext, actionName: "payment.create", requiredPermission: "payments.write", entityType: "Payment", idempotencyKey });
    const body = await readJsonObject(request);

    const outcome = await createNewPayment({
      organizationId: authContext.organization.id,
      customerId: requiredString(body, "customerId"),
      personId: optionalString(body, "personId"),
      quoteId: optionalString(body, "quoteId"),
      title: requiredString(body, "title"),
      amount: readAmount(body),
      currency: optionalString(body, "currency"),
      dueDate: readOptionalDate(body, "dueDate"),
      notes: optionalString(body, "notes"),
      idempotencyKey,
    });
    security.succeed(outcome.payment.id, outcome.created ? "SUCCEEDED" : "NO_CHANGE");

    return ok({ payment: serializePayment(outcome.payment) }, outcome.created ? 201 : 200);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, error.status);
    }

    return authFail(error);
  }
}
