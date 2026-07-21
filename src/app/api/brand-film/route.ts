import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { prisma } from "@/lib/core/shared/prisma";

const EVENT_TYPE = "BrandFilmResolved";

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const seen = await prisma.event.findFirst({
      where: { organizationId: auth.organization.id, actorUserId: auth.user.id, eventType: EVENT_TYPE },
      select: { id: true },
    });
    return ok({ shouldOffer: auth.organization.onboardingStatus === "NOT_STARTED" && !seen });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await request.json() as { outcome?: string };
    if (!(["WATCHED", "SKIPPED", "PLAYBACK_ERROR"] as const).includes(body.outcome as never)) {
      return fail("Geçersiz film sonucu.", 400);
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${auth.organization.id}), hashtext(${auth.user.id}))`;
      const existing = await tx.event.findFirst({
        where: { organizationId: auth.organization.id, actorUserId: auth.user.id, eventType: EVENT_TYPE },
        select: { id: true },
      });
      if (!existing) {
        await tx.event.create({ data: {
          organizationId: auth.organization.id,
          actorUserId: auth.user.id,
          eventType: EVENT_TYPE,
          entityType: "brand_film",
          entityId: "metrix-brand-film-v1",
          source: "USER",
          payload: { outcome: body.outcome },
        } });
      }
    });
    return ok({ recorded: true });
  } catch (error: unknown) {
    return authFail(error);
  }
}
