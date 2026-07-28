import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { listDomainCustomFields } from "@/lib/field-authority/custom-field.service";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok({ definitions: await listDomainCustomFields(auth.organization.id, "company", "company") });
  } catch (error) {
    return authFail(error);
  }
}
