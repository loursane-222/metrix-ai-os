import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { executiveLifecycleRegistry } from "@/lib/executive-lifecycle";

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    return ok({ envelopes: executiveLifecycleRegistry.snapshot({ organizationId: auth.organization.id, actorId: auth.user.id }) });
  } catch {
    return fail("Lifecycle activity could not be loaded.", 401);
  }
}
