export type PermissionEvaluationResult = {
  requiredPermissions: readonly string[];
  missingPermissions: readonly string[];
  satisfied: boolean;
};

/**
 * Deterministik, kümeler üzerinden çalışan permission karşılaştırması.
 * Role bu karşılaştırmaya hiçbir şekilde girmez — role yalnızca actor
 * context metadata'sıdır, asıl yetkilendirme permission set üzerinden
 * yürür. OWNER/EXECUTIVE gibi role isimlerine özel kısayol yoktur.
 */
export function evaluatePermissions(
  requiredPermissionSet: readonly string[],
  actorPermissions: readonly string[],
): PermissionEvaluationResult {
  const actorPermissionSet = new Set(actorPermissions);
  const missingPermissions = requiredPermissionSet.filter((permission) => !actorPermissionSet.has(permission));

  return {
    requiredPermissions: [...requiredPermissionSet],
    missingPermissions,
    satisfied: missingPermissions.length === 0,
  };
}
