import { createMemory } from "@/lib/application/memories/memory.service";
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
    const body = await readJsonObject(request);
    const memory = await createMemory({
      organizationId: requiredString(body, "organizationId"),
      actorUserId: requiredString(body, "actorUserId"),
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

    return fail("Unexpected error.");
  }
}

