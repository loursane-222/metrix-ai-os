import { authFail, requireCurrentSessionFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ok } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  try {
    const context = await requireCurrentSessionFromCookies();

    return ok(context);
  } catch (error: unknown) {
    return authFail(error);
  }
}
