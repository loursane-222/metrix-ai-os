import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { updateMemoryItemForOrganization } from "@/lib/core/memory-items/memory-item.service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ memoryItemId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { memoryItemId } = await context.params;
    assertNonEmpty(memoryItemId, "memoryItemId");

    const body = await readJsonObject(request);
    const memoryItem = await updateMemoryItemForOrganization({
      id: memoryItemId,
      organizationId: authContext.organization.id,
      updatedByUserId: authContext.user.id,
      value: requiredString(body, "value"),
    });

    if (!memoryItem) {
      return fail("Memory item was not found.", 404);
    }

    return ok({
      memoryItem,
    });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new ApiValidationError(`${fieldName} is required.`);
  }
}
