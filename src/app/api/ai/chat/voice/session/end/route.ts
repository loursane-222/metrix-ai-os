import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, optionalString, readJsonObject, requiredNumber, requiredString } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { VOICE_SESSION_ENDED } from "@/lib/core/events/event-names";
import { recordEvent } from "@/lib/core/events/event.service";

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);

    const voiceSessionId = requiredString(body, "voiceSessionId");
    const durationMs = requiredNumber(body, "durationMs");
    const inputTokens = requiredNumber(body, "inputTokens");
    const outputTokens = requiredNumber(body, "outputTokens");
    const totalTokens = requiredNumber(body, "totalTokens");
    const reason = optionalString(body, "reason") ?? "unknown";

    if (durationMs < 0) {
      return fail("durationMs must not be negative.", 400);
    }

    await recordEvent({
      organizationId: authContext.organization.id,
      actorUserId: authContext.user.id,
      eventType: VOICE_SESSION_ENDED,
      entityType: "VoiceSession",
      payload: { voiceSessionId, durationMs, reason, inputTokens, outputTokens, totalTokens },
      source: "USER",
    });

    return ok({});
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
