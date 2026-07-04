import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  isRecord,
  optionalString,
  type RequestBody,
} from "@/lib/api/validation";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { assertCanReviewMemoryCandidates } from "@/lib/memory/memory-candidate-permissions";
import { approveMemoryCandidateForOrganization } from "@/lib/memory/memory-promotion.service";

export async function POST(
  request: Request,
  context: { params: Promise<{ candidateId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    assertCanReviewMemoryCandidates(authContext);

    const { candidateId } = await context.params;
    assertNonEmpty(candidateId, "candidateId");

    const body = await readOptionalJsonObject(request);
    const result = await approveMemoryCandidateForOrganization({
      organizationId: authContext.organization.id,
      candidateId,
      approverUserId: authContext.user.id,
      supersedesMemoryId: optionalString(body, "supersedesMemoryId"),
    });

    return ok(result);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}

async function readOptionalJsonObject(request: Request): Promise<RequestBody> {
  const text = await request.text();

  if (text.trim().length === 0) {
    return {};
  }

  let body: unknown;

  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new ApiValidationError("Invalid JSON body.");
  }

  if (!isRecord(body)) {
    throw new ApiValidationError("Request body must be a JSON object.");
  }

  return body;
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new ApiValidationError(`${fieldName} is required.`);
  }
}
