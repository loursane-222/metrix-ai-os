import { fail, ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { resolveAndSendPaymentReminder } from "@/lib/executive-communication/payment-reminder-trigger-resolver";
import { generatePaymentReminderText } from "@/lib/executive-communication/payment-reminder-ai-adapter";

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const utterance = requiredString(body, "utterance");

    const outcome = await resolveAndSendPaymentReminder({
      utterance,
      organizationId: auth.organization.id,
      actorUserId: auth.user.id,
      generateText: generatePaymentReminderText,
    });

    return ok({ outcome });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[payment_reminder] failed", { errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return fail("Tahsilat hatırlatması gönderilemedi.", 500);
  }
}
