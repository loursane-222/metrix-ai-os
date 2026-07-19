import { createMemory } from "@/lib/application/memories/memory.service";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { assertCanReviewMemoryCandidates } from "@/lib/memory/memory-candidate-permissions";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalJsonValue,
  optionalNumber,
  optionalString,
  readJsonObject,
  requiredString,
  requiredStringEnum,
} from "@/lib/api/validation";

const MEMORY_TYPES = [
  "FACT",
  "PERSON",
  "PROCESS",
  "RELATIONSHIP",
  "PREFERENCE",
] as const;

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    assertCanReviewMemoryCandidates(authContext);
    const body = await readJsonObject(request);
    const memory = await createMemory({
      organizationId: authContext.organization.id,
      actorUserId: authContext.user.id,
      type: requiredStringEnum(body, "type", MEMORY_TYPES),
      title: requiredString(body, "title"),
      content: requiredString(body, "content"),
      entityType: optionalString(body, "entityType"),
      entityId: optionalString(body, "entityId"),
      importance: optionalNumber(body, "importance"),
      confidence: optionalNumber(body, "confidence"),
      metadata: optionalJsonValue(body, "metadata"),
    });

    return ok(memory);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
