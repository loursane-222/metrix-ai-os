import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { ok } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  try {
    const organizationId =
      new URL(request.url).searchParams.get("organizationId") ?? undefined;
    const context = await requireAuthContextFromCookies(organizationId);

    return ok(context);
  } catch (error: unknown) {
    return authFail(error);
  }
}
