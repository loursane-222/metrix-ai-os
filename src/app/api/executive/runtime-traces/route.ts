import { fail, ok } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { prisma } from "@/lib/core/shared/prisma";

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    const requestId = url.searchParams.get("requestId");
    const traces = await prisma.executiveRuntimeTraceRecord.findMany({
      where: {
        organizationId: auth.organization.id,
        ...(conversationId ? { conversationId } : {}),
        ...(requestId ? { requestId } : {}),
      },
      select: {
        requestId: true,
        conversationId: true,
        channel: true,
        schemaVersion: true,
        traceJson: true,
        redactionVersion: true,
        persistenceStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return ok({ traces });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Runtime traces could not be loaded.", 500);
  }
}
