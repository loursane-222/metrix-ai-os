export type TeamMemberRecord = Readonly<{ id: string; email: string; fullName: string | null; role: string; status: string; joinedAt: string }>;
export type TeamMemberResolution = { status: "RESOLVED"; member: TeamMemberRecord } | { status: "NOT_FOUND" } | { status: "AMBIGUOUS"; options: TeamMemberRecord[] };

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@+]/g, "");

export function resolveTeamMemberReference(members: readonly TeamMemberRecord[], reference: string): TeamMemberResolution {
  const needle = normalize(reference);
  if (!needle) return { status: "NOT_FOUND" };
  const fields = (member: TeamMemberRecord) => [member.email, member.fullName];
  const exact = members.filter((member) => fields(member).some((value) => value && normalize(value) === needle));
  if (exact.length === 1) return { status: "RESOLVED", member: exact[0]! };
  if (exact.length > 1) return { status: "AMBIGUOUS", options: exact };
  const partial = members.filter((member) => fields(member).some((value) => value && normalize(value).includes(needle)));
  if (partial.length === 1) return { status: "RESOLVED", member: partial[0]! };
  if (partial.length > 1) return { status: "AMBIGUOUS", options: partial };
  return { status: "NOT_FOUND" };
}
