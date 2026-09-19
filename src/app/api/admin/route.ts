import { NextResponse } from "next/server";
import { calculateComparableProfit } from "../../../lib/platform/access-policy";
import { requirePlatformAdmin, PlatformAdminDeniedError } from "../../../lib/platform/platform-auth";
import { db } from "../../../lib/db";

type Totals = Map<string, bigint>;
const add = (totals: Totals, currency: string, amount: bigint) => totals.set(currency, (totals.get(currency) ?? 0n) + amount);
const serialize = (totals: Totals) => Object.fromEntries([...totals.entries()].map(([currency, amount]) => [currency, amount.toString()]));
const only = (totals: Totals) => totals.size === 1 ? [...totals.entries()][0] : null;

function financials(payments: Array<{ amountCents: bigint; currency: string }>, usage: Array<{ costCents: bigint | null; currency: string }>) {
  const revenue = new Map<string, bigint>(); const cost = new Map<string, bigint>();
  for (const payment of payments) add(revenue, payment.currency, payment.amountCents);
  let measurable = true;
  for (const event of usage) {
    if (event.costCents === null) { measurable = false; continue; }
    add(cost, event.currency, event.costCents);
  }
  const revenueOnly = only(revenue); const costOnly = only(cost);
  // A missing cost is a known zero only if every observed usage event was priced.
  const comparable = measurable && revenueOnly
    ? calculateComparableProfit(revenueOnly[1], revenueOnly[0], costOnly?.[1] ?? 0n, costOnly?.[0] ?? revenueOnly[0])
    : null;
  return { revenueByCurrency: serialize(revenue), costByCurrency: serialize(cost), measurable, profitCents: comparable?.profitCents.toString() ?? null, profitCurrency: comparable?.currency ?? null, marginPercent: comparable?.marginPercent ?? null };
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const [users, applications, invitations] = await Promise.all([
      db.user.findMany({ where: { platformRole: "NONE" }, include: { memberships: { include: { organization: true }, take: 1 }, platformSubscriptions: { include: { payments: true } }, usageEvents: true }, orderBy: { createdAt: "desc" } }),
      db.accessApplication.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" } }),
      db.platformInvitation.findMany({ orderBy: { createdAt: "desc" } })
    ]);
    const allPayments = users.flatMap(user => user.platformSubscriptions.flatMap(subscription => subscription.payments));
    const allUsage = users.flatMap(user => user.usageEvents);
    const rows = users.map(user => {
      const subscription = user.platformSubscriptions[0];
      const value = financials(subscription?.payments ?? [], user.usageEvents);
      return { id: user.id, name: user.name, email: user.email, company: user.memberships[0]?.organization.name ?? null, status: user.platformStatus, subscription: subscription ? { plan: subscription.plan, status: subscription.status, renewsAt: subscription.renewsAt?.toISOString() ?? null } : null, financial: value };
    });
    const total = financials(allPayments, allUsage);
    const now = Date.now();
    return NextResponse.json({
      ok: true,
      kpis: { users: rows.length, ...total }, users: rows,
      applications: applications.map(application => ({ id: application.id, name: application.name, company: application.company, email: application.email, phone: application.phone, note: application.note, createdAt: application.createdAt.toISOString() })),
      invitations: invitations.map(invitation => ({ id: invitation.id, name: invitation.name, company: invitation.company, email: invitation.email, createdAt: invitation.createdAt.toISOString(), expiresAt: invitation.expiresAt.toISOString(), status: invitation.acceptedAt ? "ACCEPTED" : invitation.expiresAt.getTime() <= now ? "EXPIRED" : "PENDING" }))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PlatformAdminDeniedError) return NextResponse.json({ ok: false, code: error.code }, { status: 403 });
    throw error;
  }
}
