import { fail, ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { sendSupplierMessage } from "@/lib/executive-communication/executive-communication.service";

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const supplierId = requiredString(body, "supplierId");
    const messageBody = requiredString(body, "messageBody");

    const outcome = await sendSupplierMessage({
      organizationId: auth.organization.id,
      supplierId,
      messageBody,
      actorUserId: auth.user.id,
    });

    return ok({ outcome });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[supplier_message] failed", { errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return fail("Tedarikçi mesajı gönderilemedi.", 500);
  }
}
