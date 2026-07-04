import { getMemoryContext } from "@/lib/application/memories/memory.service";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  requiredSearchParam,
} from "@/lib/api/validation";

export async function GET(request: Request): Promise<Response> {
  try {
    const organizationId = requiredSearchParam(request, "organizationId");
    const memoryContext = await getMemoryContext(organizationId);

    return ok(memoryContext);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return fail("Unexpected error.");
  }
}

