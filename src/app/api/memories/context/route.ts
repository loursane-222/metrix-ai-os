import { getMemoryContext } from "@/lib/application/memories/memory.service";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
} from "@/lib/api/validation";

export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const memoryContext = await getMemoryContext(authContext.organization.id);

    return ok(memoryContext);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
