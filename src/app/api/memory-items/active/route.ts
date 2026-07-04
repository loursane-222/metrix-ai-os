import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { ok } from "@/lib/api/response";
import { listActiveMemoryItemsByOrganization } from "@/lib/core/memory-items/memory-item.service";

export async function GET(): Promise<Response> {
  try {
    const context = await requireAuthContextFromCookies();
    const memoryItems = await listActiveMemoryItemsByOrganization(
      context.organization.id,
    );

    return ok({
      memoryItems,
      count: memoryItems.length,
    });
  } catch (error: unknown) {
    return authFail(error);
  }
}
