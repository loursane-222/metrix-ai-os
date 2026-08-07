import type { OrganizationRole } from "@prisma/client";

export type NotificationRecipientCandidate = Readonly<{
  userId: string;
  fullName: string | null;
  role: OrganizationRole;
}>;

export type NotificationRecipientResolution =
  | Readonly<{ status: "RESOLVED"; recipient: NotificationRecipientCandidate }>
  | Readonly<{ status: "AMBIGUOUS"; candidates: readonly NotificationRecipientCandidate[] }>
  | Readonly<{ status: "UNRESOLVED"; reason: "PERSONAL_HIERARCHY_UNAVAILABLE" | "NO_MATCH" }>;

const ROLE_TERMS: Readonly<Record<string, OrganizationRole>> = Object.freeze({
  sahip: "OWNER", patron: "OWNER", yönetici: "MANAGER", müdür: "MANAGER",
  "satış müdürü": "MANAGER", "satis muduru": "MANAGER", "takım lideri": "TEAM_LEAD",
  "takim lideri": "TEAM_LEAD", çalışan: "EMPLOYEE", calisan: "EMPLOYEE", personel: "EMPLOYEE",
  yöneticiye: "MANAGER", müdüre: "MANAGER", "satış müdürüne": "MANAGER", "satis mudurune": "MANAGER",
  "takım liderine": "TEAM_LEAD", "takim liderine": "TEAM_LEAD", çalışana: "EMPLOYEE", calisana: "EMPLOYEE", personele: "EMPLOYEE",
});

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/[’']/gu, "").replace(/\s+/gu, " ");

export function resolveNotificationRecipient(target: string, members: readonly NotificationRecipientCandidate[]): NotificationRecipientResolution {
  const raw = normalize(target);
  const normalized = raw.replace(/(?:[ıiuü]n[ae]|n[ae]|y[ae]|[ae])$/u, "").trim();
  if (/^(?:benim\s+)?yöneticim$/u.test(normalized)) return { status: "UNRESOLVED", reason: "PERSONAL_HIERARCHY_UNAVAILABLE" };
  const active = members.filter((member) => member.fullName?.trim());
  const nameMatches = active.filter((member) => {
    const fullName = normalize(member.fullName ?? "");
    return fullName === normalized || fullName.split(" ")[0] === normalized;
  });
  if (nameMatches.length === 1) return { status: "RESOLVED", recipient: nameMatches[0]! };
  if (nameMatches.length > 1) return { status: "AMBIGUOUS", candidates: nameMatches };
  const role = ROLE_TERMS[raw] ?? ROLE_TERMS[normalized];
  if (!role) return { status: "UNRESOLVED", reason: "NO_MATCH" };
  const roleMatches = active.filter((member) => member.role === role);
  if (roleMatches.length === 1) return { status: "RESOLVED", recipient: roleMatches[0]! };
  if (roleMatches.length > 1) return { status: "AMBIGUOUS", candidates: roleMatches };
  return { status: "UNRESOLVED", reason: "NO_MATCH" };
}
