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
  [OrganizationRole.OWNER]: ["customers.write", "customers.archive"],
  [OrganizationRole.EXECUTIVE]: ["customers.write", "customers.archive"],
  [OrganizationRole.MANAGER]: ["customers.write"],
  [OrganizationRole.TEAM_LEAD]: ["customers.write"],
  [OrganizationRole.EMPLOYEE]: ["customers.write"],
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
