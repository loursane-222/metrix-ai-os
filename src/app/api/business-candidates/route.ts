import { BusinessCandidateSourceChannel, BusinessCandidateStatus } from "@prisma/client";

import { fail, ok } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { listBusinessCandidates } from "@/lib/business-reality-candidates";

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const url = new URL(request.url);
    const statusValue = url.searchParams.get("status");
    const status = statusValue && Object.values(BusinessCandidateStatus).includes(
      statusValue as BusinessCandidateStatus,
    )
      ? statusValue as BusinessCandidateStatus
      : undefined;
    const sourceChannelValue = url.searchParams.get("sourceChannel");
    const sourceChannel = sourceChannelValue && Object.values(BusinessCandidateSourceChannel).includes(
      sourceChannelValue as BusinessCandidateSourceChannel,
    )
      ? sourceChannelValue as BusinessCandidateSourceChannel
      : undefined;
    const sourceMessageId = url.searchParams.get("sourceMessageId") ?? undefined;
    const limitValue = Number(url.searchParams.get("limit") ?? 50);
    const candidates = await listBusinessCandidates({
      organizationId: auth.organization.id,
      ...(status ? { status } : {}),
      ...(sourceChannel ? { sourceChannel } : {}),
      ...(sourceMessageId ? { sourceMessageId } : {}),
      limit: Number.isFinite(limitValue) ? limitValue : 50,
    });
    return ok({ candidates });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Business candidates could not be loaded.", 500);
  }
}
