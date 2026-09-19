import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { sendEmailViaResend, type EmailSender, type SendEmailInput } from "../email/resend-client";

const email = z.string().trim().toLowerCase().email();
const applicationSchema = z.object({ name: z.string().trim().min(2).max(120), company: z.string().trim().min(2).max(200), email, phone: z.string().trim().max(40).optional(), note: z.string().trim().max(1000).optional() });
const inviteSchema = z.object({ email, name: z.string().trim().min(2).max(120).optional(), company: z.string().trim().min(2).max(200), expiresInDays: z.number().int().min(1).max(30).default(7) });

export class AccessApplicationConflictError extends Error { readonly code = "APPLICATION_ALREADY_EXISTS"; }
export class InvitationConflictError extends Error { readonly code = "INVITATION_ALREADY_PENDING"; }
export class InvitationInvalidError extends Error { readonly code = "INVITATION_INVALID_OR_EXPIRED"; }
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export type InvitationEmailKind = "DIRECT" | "APPLICATION_APPROVED";

export function buildInvitationEmail({ name, url, expiresInDays, baseUrl, kind }: { name?: string | null; url: string; expiresInDays: number; baseUrl: string; kind: InvitationEmailKind }): SendEmailInput {
  const greeting = name ? `Merhaba ${name},` : "Merhaba,";
  const approved = kind === "APPLICATION_APPROVED";
  const subject = approved ? "METRIX başvurunuz onaylandı" : "METRIX'e davet edildiniz";
  const opening = approved ? "Başvurunuz onaylandı. İşletmeniz için METRIX hesabınız hazır." : "İşletmeniz için METRIX hesabınız hazır.";
  const copy = "METRIX; şirketinizin satış, finans, müşteri, görev, belge ve operasyon verilerini tek yerde takip eden ve sizinle birlikte çalışan yapay zekâ Genel Müdürünüzdür.";
  const action = "Hesabınızı oluşturmak ve şirketinizi METRIX'e bağlamak için davetinizi kabul edin.";
  const expiry = `Bu davet yalnızca sizin e-posta adresiniz için geçerlidir ve ${expiresInDays} gün sonra geçerliliğini yitirir.`;
  const logoUrl = `${baseUrl}/brand/metrix-wordmark-white.png`;
  const text = `${greeting}\n\n${opening}\n\n${copy}\n\n${action}\n\nDaveti Kabul Et: ${url}\n\n${expiry}\n\nMETRIX\nŞirketinizin yapay zekâ Genel Müdürü`;
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 32px;background:#111b30"><img src="${logoUrl}" width="132" alt="METRIX" style="display:block;width:132px;height:auto;border:0;outline:none"></td></tr><tr><td style="padding:36px 32px"><h1 style="margin:0 0 24px;font-size:24px;line-height:32px;color:#172033">${subject}</h1><p style="margin:0 0 18px;font-size:16px;line-height:24px">${greeting}</p><p style="margin:0 0 18px;font-size:16px;line-height:24px">${opening}</p><p style="margin:0 0 18px;font-size:16px;line-height:24px">${copy}</p><p style="margin:0 0 28px;font-size:16px;line-height:24px">${action}</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:8px;background:#2958f2"><a href="${url}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700">Daveti Kabul Et</a></td></tr></table><p style="margin:28px 0 0;font-size:13px;line-height:20px;color:#59677e">${expiry}</p></td></tr><tr><td style="padding:20px 32px;background:#f7f9fc;font-size:13px;line-height:20px;color:#59677e"><strong style="color:#172033">METRIX</strong><br>Şirketinizin yapay zekâ Genel Müdürü</td></tr></table></td></tr></table></body></html>`;
  return { to: "", subject, text, html };
}

export async function submitAccessApplication(raw: z.input<typeof applicationSchema>) {
  const input = applicationSchema.parse(raw);
  const existing = await db.accessApplication.findUnique({ where: { email: input.email } });
  if (existing) throw new AccessApplicationConflictError();
  const application = await db.accessApplication.create({ data: input });
  void db.notification.createMany({
    data: (await db.user.findMany({ where: { platformRole: "ADMIN", platformStatus: "ACTIVE" }, select: { id: true } })).map(admin => ({ userId: admin.id, category: "PLATFORM_ACCESS", priority: "HIGH" as const, title: "Yeni erişim başvurusu", body: `${application.name} · ${application.company}`, sourceType: "AccessApplication", sourceId: application.id, platformIdempotencyKey: `access-application:${application.id}:${admin.id}` })),
    skipDuplicates: true
  }).catch(() => console.error("[metrix] platform application notification persistence failed", { applicationId: application.id }));
  return application;
}

export async function createPlatformInvitation(raw: z.input<typeof inviteSchema>, createdById: string, deps: { sendEmail?: EmailSender; baseUrl?: string; kind?: InvitationEmailKind } = {}) {
  const input = inviteSchema.parse(raw);
  const now = new Date();
  const active = await db.platformInvitation.findFirst({ where: { email: input.email, acceptedAt: null, expiresAt: { gt: now } }, select: { id: true } });
  if (active) throw new InvitationConflictError();
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + input.expiresInDays * 86_400_000);
  const invitation = await db.platformInvitation.create({ data: { email: input.email, name: input.name, company: input.company, tokenHash: tokenHash(rawToken), expiresAt, createdById } });
  const baseUrl = (deps.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = `${baseUrl}/invite?token=${encodeURIComponent(rawToken)}`;
  try {
    const message = buildInvitationEmail({ name: input.name, url, expiresInDays: input.expiresInDays, baseUrl, kind: deps.kind ?? "DIRECT" });
    await (deps.sendEmail ?? sendEmailViaResend)({ ...message, to: input.email });
  } catch (error) {
    await db.platformInvitation.delete({ where: { id: invitation.id } });
    throw error;
  }
  return { invitation, url };
}

export async function acceptPlatformInvitation(rawToken: string) {
  const now = new Date();
  const invitation = await db.platformInvitation.findUnique({ where: { tokenHash: tokenHash(rawToken.trim()) } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= now) throw new InvitationInvalidError();
  return db.$transaction(async tx => {
    const current = await tx.platformInvitation.findUnique({ where: { id: invitation.id } });
    if (!current || current.acceptedAt || current.expiresAt <= now) throw new InvitationInvalidError();
    const user = await tx.user.upsert({ where: { email: current.email }, create: { email: current.email, name: current.name }, update: { name: current.name ?? undefined, platformStatus: "ACTIVE" } });
    const existingMembership = await tx.organizationMember.findFirst({ where: { userId: user.id }, select: { id: true } });
    if (existingMembership) throw new InvitationInvalidError();
    const organization = await tx.organization.create({ data: { name: current.company, members: { create: { userId: user.id, role: "OWNER" } } } });
    await tx.platformSubscription.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: { status: "ACTIVE" } });
    await tx.platformInvitation.update({ where: { id: current.id }, data: { acceptedAt: now, acceptedUserId: user.id } });
    return { user, organization };
  });
}
