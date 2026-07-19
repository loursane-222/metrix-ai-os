import { generateAiResponse } from "@/lib/ai/orchestration.service";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import {
  AiProviderConfigurationError,
  AiProviderRequestError,
} from "@/lib/ai/providers/ai-provider";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  optionalString,
  optionalStringEnum,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";

const AI_PROVIDERS = ["mock", "openai"] as const;
const PROMPT_TEMPLATES = [
  "onboarding_assistant",
  "general_conversation",
  "memory_extraction",
] as const;

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return fail("Not found.", 404);
  }

  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const response = await generateAiResponse({
      organizationId: authContext.organization.id,
      conversationId: requiredString(body, "conversationId"),
      userMessage: requiredString(body, "userMessage"),
      provider: optionalStringEnum(body, "provider", AI_PROVIDERS),
      promptTemplateId: optionalStringEnum(
        body,
        "promptTemplateId",
        PROMPT_TEMPLATES,
      ),
      organizationSummary: optionalString(body, "organizationSummary"),
    });

    return ok(response);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    if (error instanceof AiProviderConfigurationError) {
      return fail(error.message, 503);
    }

    if (error instanceof AiProviderRequestError) {
      return fail(error.message, 502);
    }

    return authFail(error);
  }
}
