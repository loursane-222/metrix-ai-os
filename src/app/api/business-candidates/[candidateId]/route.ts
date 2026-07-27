import { fail, ok } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { getBusinessCandidate } from "@/lib/business-reality-candidates";

export async function GET(
  _request: Request,
  context: { params: Promise<{ candidateId: string }> },
): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { candidateId } = await context.params;
    const candidate = await getBusinessCandidate({
      organizationId: auth.organization.id,
      candidateId,
    });
    if (!candidate) return fail("Business candidate not found.", 404);
    return ok({ candidate });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Business candidate could not be loaded.", 500);
  }
}
