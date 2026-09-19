import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../../../lib/db";
import { createPlatformInvitation, InvitationConflictError } from "../../../../lib/platform/access-service";
import { PlatformAdminDeniedError, requirePlatformAdmin } from "../../../../lib/platform/platform-auth";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email: z.string(), name: z.string().optional(), company: z.string(), expiresInDays: z.number().optional() }),
  z.object({ action: z.literal("reviewApplication"), applicationId: z.string(), decision: z.enum(["APPROVED", "REJECTED"]), rejectionReason: z.string().max(500).optional() }),
  z.object({ action: z.literal("setStatus"), userId: z.string(), status: z.enum(["ACTIVE", "SUSPENDED"]) }),
  z.object({ action: z.literal("payment"), userId: z.string(), amountCents: z.string(), note: z.string().max(500).optional() }),
  z.object({ action: z.literal("renew"), userId: z.string(), plan: z.string().min(1).max(100), renewsAt: z.string().datetime().optional() })
]);
export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request); const body = schema.parse(await request.json());
    if (body.action === "invite") { const value = await createPlatformInvitation(body, admin.userId); return NextResponse.json({ ok: true, invitationId: value.invitation.id }); }
    if (body.action === "reviewApplication") {
      const application = await db.accessApplication.findUnique({ where: { id: body.applicationId } });
      if (!application || application.status !== "PENDING") return NextResponse.json({ ok: false, code: "APPLICATION_NOT_PENDING" }, { status: 409 });
      if (body.decision === "APPROVED") {
        const invite = await createPlatformInvitation({ email: application.email, name: application.name, company: application.company }, admin.userId, { kind: "APPLICATION_APPROVED" });
        await db.accessApplication.update({ where: { id: application.id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: admin.userId, rejectionReason: null, invitationId: invite.invitation.id } });
      } else {
        await db.accessApplication.update({ where: { id: application.id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: admin.userId, rejectionReason: body.rejectionReason ?? null } });
      }
    }
    if (body.action === "setStatus") { await db.user.update({ where: { id: body.userId }, data: { platformStatus: body.status } }); if (body.status === "SUSPENDED") await db.session.updateMany({ where: { userId: body.userId, revokedAt: null }, data: { revokedAt: new Date() } }); }
    if (body.action === "payment") { const subscription = await db.platformSubscription.upsert({ where: { userId: body.userId }, create: { userId: body.userId }, update: {} }); await db.platformPayment.create({ data: { subscriptionId: subscription.id, recordedById: admin.userId, amountCents: BigInt(body.amountCents), note: body.note } }); }
    if (body.action === "renew") await db.platformSubscription.upsert({ where: { userId: body.userId }, create: { userId: body.userId, plan: body.plan, renewsAt: body.renewsAt ? new Date(body.renewsAt) : null }, update: { plan: body.plan, status: "ACTIVE", renewsAt: body.renewsAt ? new Date(body.renewsAt) : null } });
    return NextResponse.json({ ok: true });
  } catch (error) { if (error instanceof PlatformAdminDeniedError) return NextResponse.json({ ok: false, code: error.code }, { status: 403 }); if (error instanceof InvitationConflictError) return NextResponse.json({ ok: false, code: error.code }, { status: 409 }); return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 }); }
}
