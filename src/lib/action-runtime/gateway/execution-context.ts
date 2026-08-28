import { OrganizationRole } from "@prisma/client";

import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { ExecutionContext } from "../execution";

/**
 * Geçiş (bridge) politikası: OrganizationMember yalnızca role taşır, kalıcı
 * bir permission set alanı yoktur. Policy Engine role adına bakmaz, yalnız
 * permissions dizisine bakar — bu yüzden role -> permission çözümü merkezi
 * ve tek bu dosyada yapılır. En az yetki prensibiyle başlar: her rol yalnızca
 * kendi iş akışını yürütmek için gereken izinleri alır. Organization-specific
 * kalıcı RBAC eklendiğinde bu harita onun yerini alacak şekilde değiştirilir;
 * o zamana kadar tek doğruluk kaynağı budur.
 */
const ROLE_PERMISSIONS: Record<OrganizationRole, readonly string[]> = {
  [OrganizationRole.OWNER]: ["company.write", "company.fields.manage", "members.manage", "customers.write", "customers.archive", "customers.fields.manage", "products.write", "products.archive", "suppliers.write", "orders.write", "deliveries.write", "stock.write", "production.write", "goals.write", "goals.archive", "quotes.write", "payments.write", "collections.write", "invoices.write", "executive_actions.write", "integrations.write", "notifications.write", "tasks.write", "field_visits.write"],
  [OrganizationRole.EXECUTIVE]: ["company.write", "company.fields.manage", "members.manage", "customers.write", "customers.archive", "customers.fields.manage", "products.write", "products.archive", "suppliers.write", "orders.write", "deliveries.write", "stock.write", "production.write", "goals.write", "goals.archive", "quotes.write", "payments.write", "collections.write", "invoices.write", "executive_actions.write", "integrations.write", "notifications.write", "tasks.write", "field_visits.write"],
  [OrganizationRole.MANAGER]: ["company.write", "customers.write", "products.write", "suppliers.write", "orders.write", "deliveries.write", "stock.write", "production.write", "goals.write", "quotes.write", "payments.write", "collections.write", "invoices.write", "notifications.write", "tasks.write", "field_visits.write"],
  // A plain EMPLOYEE/TEAM_LEAD does NOT get orders.write/payments.write
  // here — that would open the general order/payment mutation surface
  // (regular chat "sipariş oluştur", the legacy /api/orders and
  // /api/payments POST routes) to every field rep, not just the field-visit
  // reporting flow. The field-visit orchestrator grants that pair narrowly,
  // per-request, only for its own order.create/payment.create sub-calls —
  // see field-visit-report-orchestrator.service.ts.
  [OrganizationRole.TEAM_LEAD]: ["customers.write", "notifications.write", "tasks.write", "field_visits.write"],
  [OrganizationRole.EMPLOYEE]: ["customers.write", "notifications.write", "tasks.write", "field_visits.write"],
};

/** Bilinmeyen/gelecekte eklenecek bir rol için güvenli varsayılan: hiçbir izin. */
export function resolveExecutionPermissions(role: string): readonly string[] {
  return ROLE_PERMISSIONS[role as OrganizationRole] ?? [];
}

/**
 * Trusted server AuthContext'ten (requireAuthContextFromCookies) bir
 * ExecutionContext üretir. Client'tan gelen actor/organization/permission
 * bilgisine asla güvenilmez — bu fonksiyon her zaman cookie tabanlı auth
 * context'i tek girdi olarak kabul eder.
 */
export function buildExecutionContext(authContext: AuthContext): ExecutionContext {
  return {
    actorId: authContext.user.id,
    organizationId: authContext.organization.id,
    role: authContext.membership.role,
    permissions: resolveExecutionPermissions(authContext.membership.role),
    sessionRef: authContext.session.id,
    issuedAt: authContext.session.createdAt.toISOString(),
    expiresAt: authContext.session.expiresAt.toISOString(),
  };
}
