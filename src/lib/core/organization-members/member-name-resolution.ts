import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { listActiveNotificationRecipientRecords } from "./organization-member.repository";

// Diacritic-tolerant Turkish name matching — shared by every conversation
// extension that resolves a free-text "who is this about" reference (field
// visits, rep goals, report review, rep requests) against active org
// members. Previously duplicated near-identically in four files.
export function normalizeTurkish(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@+]/g, "");
}

const SELF_KEYWORDS = ["ben", "benim", "kendim", "kendi"];

export function isSelfReference(value: string): boolean {
  const n = normalizeTurkish(value);
  return SELF_KEYWORDS.some((keyword) => n.includes(keyword));
}

type NameResolvableMember = Readonly<{ fullName: string | null }>;

export type MemberNameResolution<M extends NameResolvableMember> =
  | { status: "RESOLVED"; member: M & { fullName: string } }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS"; options: readonly (M & { fullName: string })[] };

/**
 * Exact match wins if any exists; otherwise falls back to a substring
 * match. Zero matches -> NOT_FOUND, more than one -> AMBIGUOUS.
 */
export function resolveOrganizationMemberByName<M extends NameResolvableMember>(members: readonly M[], nameRaw: string): MemberNameResolution<M> {
  const needle = normalizeTurkish(nameRaw);
  const named = members.filter((member): member is M & { fullName: string } => Boolean(member.fullName));
  const exact = named.filter((member) => normalizeTurkish(member.fullName) === needle);
  const matches = exact.length > 0 ? exact : named.filter((member) => normalizeTurkish(member.fullName).includes(needle));
  if (matches.length === 0) return { status: "NOT_FOUND" };
  if (matches.length > 1) return { status: "AMBIGUOUS", options: matches.slice(0, 5) };
  return { status: "RESOLVED", member: matches[0]! };
}

export type RepNameResolution =
  | { status: "RESOLVED"; userId: string; fullName: string }
  | { status: "REP_NOT_FOUND" }
  | { status: "REP_AMBIGUOUS"; options: readonly string[] };

/**
 * "kendi"/"ben"/... resolves to the actor themself; anything else is
 * matched by name against active org members. The combinator every
 * manager-decision flow (rep goals, report review, rep requests) needs.
 */
export async function resolveRepByName(authContext: AuthContext, repNameRaw: string): Promise<RepNameResolution> {
  if (isSelfReference(repNameRaw)) {
    return { status: "RESOLVED", userId: authContext.user.id, fullName: authContext.user.fullName ?? "Siz" };
  }

  const members = await listActiveNotificationRecipientRecords(authContext.organization.id);
  const resolution = resolveOrganizationMemberByName(members, repNameRaw);
  if (resolution.status === "NOT_FOUND") return { status: "REP_NOT_FOUND" };
  if (resolution.status === "AMBIGUOUS") return { status: "REP_AMBIGUOUS", options: resolution.options.map((member) => member.fullName) };
  return { status: "RESOLVED", userId: resolution.member.userId, fullName: resolution.member.fullName };
}
