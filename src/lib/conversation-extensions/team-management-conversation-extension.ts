import { resolveTeamMemberReference, type TeamMemberRecord } from "@/lib/team/team-resolution";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { teamHandoff } from "./conversation-extension-handoff";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";

type Role = "OWNER" | "EXECUTIVE" | "MANAGER" | "TEAM_LEAD" | "EMPLOYEE";

const LIST_TEAM = /^(?:ekibi\s+g[oö]ster|ekip\s+listesini\s+g[oö]ster)[.!]?$/iu;
const INVITE = /^([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})(?:'|’)?(?:y?[ıi]|y?u|y?[uü])\s+(.+?)\s+olarak\s+davet\s+et[.!]?$/iu;
const CHANGE_ROLE = /^(.+?)(?:'|’)?(?:n[ıi]n|nun|n[uü]n|in|[ıi]n|un|[uü]n)\s+rol[uü]n[uü]\s+(.+?)\s+yap[.!]?$/iu;
const TOGGLE = /^(.+?)(?:'|’)?(?:y?[ıi]|y?i|y?u|y?[uü])\s+(devre\s+d[ıi][sş][ıi]\s+b[ıi]rak|etkinle[sş]tir)[.!]?$/iu;

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
const ROLE_MAP: Readonly<Record<string, Role>> = {
  owner: "OWNER", sahip: "OWNER",
  executive: "EXECUTIVE", "ust yonetici": "EXECUTIVE", "yonetim uyesi": "EXECUTIVE",
  manager: "MANAGER", yonetici: "MANAGER",
  teamlead: "TEAM_LEAD", "team lead": "TEAM_LEAD", "takim lideri": "TEAM_LEAD", "ekip lideri": "TEAM_LEAD",
  employee: "EMPLOYEE", calisan: "EMPLOYEE", personel: "EMPLOYEE",
};

function roleFrom(value: string): Role | null {
  const key = normalize(value);
  return ROLE_MAP[key] ?? ROLE_MAP[key.replace(/\s/g, "")] ?? null;
}

function navigate(source: ConversationExtensionSource, correlationId: string): void {
  if (typeof window !== "undefined") void dispatchConversationNavigation({ route: "/metrix/team", source, correlationId, expectedSurfaceAuthorityKey: "team.members.page" });
}

async function members(): Promise<TeamMemberRecord[] | null> {
  const response = await fetch("/api/organization-members", { credentials: "include" });
  const payload = await response.json() as { ok?: boolean; data?: { members?: TeamMemberRecord[] } };
  return response.ok && payload.ok && payload.data?.members ? payload.data.members : null;
}

async function patchMember(memberId: string, body: { role?: Role; disabled?: boolean }): Promise<boolean> {
  const response = await fetch(`/api/organization-members/${encodeURIComponent(memberId)}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { ok?: boolean };
  return response.ok && payload.ok === true;
}

export const teamManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey: () => typeof window === "undefined" ? null : `team-management:${window.location.pathname}`,
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (LIST_TEAM.test(text)) {
      navigate(source, correlationId);
      return { status: "HANDOFF", handoff: teamHandoff({ operation: "NAVIGATE", outcomeCode: "TEAM_LIST_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }

    const invite = text.match(INVITE);
    if (invite) {
      const role = roleFrom(invite[2]!);
      if (!role) return { status: "HANDOFF", handoff: teamHandoff({ operation: "CREATE", outcomeCode: "TEAM_ROLE_INVALID", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_REQUIRED" }) };
      const response = await fetch("/api/organization-members", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: invite[1]!.toLowerCase(), role }) });
      const payload = await response.json() as { ok?: boolean; data?: { member?: TeamMemberRecord } };
      if (!response.ok || !payload.ok) return { status: "HANDOFF", handoff: teamHandoff({ operation: "CREATE", outcomeCode: "TEAM_INVITE_FAILED", resultStatus: "FAILED", failureCode: "TEAM_INVITE_FAILED" }) };
      navigate(source, correlationId);
      return { status: "HANDOFF", handoff: teamHandoff({ operation: "CREATE", outcomeCode: "TEAM_MEMBER_INVITED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true, navigationRequested: true, navigationStatus: "COMPLETED", candidateNames: [invite[1]!] }) };
    }

    const roleChange = text.match(CHANGE_ROLE);
    const toggle = text.match(TOGGLE);
    if (!roleChange && !toggle) return { status: "NOT_HANDLED", handoff: null };
    const list = await members();
    if (!list) return { status: "HANDOFF", handoff: teamHandoff({ operation: "UPDATE", outcomeCode: "TEAM_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "TEAM_LOOKUP_FAILED" }) };
    const resolution = resolveTeamMemberReference(list, (roleChange?.[1] ?? toggle?.[1])!.trim());
    if (resolution.status !== "RESOLVED") return { status: "HANDOFF", handoff: teamHandoff({ operation: "UPDATE", outcomeCode: resolution.status === "AMBIGUOUS" ? "TEAM_MEMBER_AMBIGUOUS" : "TEAM_MEMBER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: resolution.status }) };
    const role = roleChange ? roleFrom(roleChange[2]!) : null;
    if (roleChange && !role) return { status: "HANDOFF", handoff: teamHandoff({ operation: "UPDATE", outcomeCode: "TEAM_ROLE_INVALID", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "RESOLVED" }) };
    const disabled = toggle ? normalize(toggle[2]!).startsWith("devre disi") : undefined;
    const updated = await patchMember(resolution.member.id, roleChange ? { role: role! } : { disabled });
    if (!updated) return { status: "HANDOFF", handoff: teamHandoff({ operation: "UPDATE", outcomeCode: "TEAM_MEMBER_UPDATE_FAILED", resultStatus: "FAILED", entityResolution: "RESOLVED", failureCode: "TEAM_MEMBER_UPDATE_FAILED" }) };
    navigate(source, correlationId);
    return { status: "HANDOFF", handoff: teamHandoff({ operation: "UPDATE", outcomeCode: roleChange ? "TEAM_MEMBER_ROLE_CHANGED" : disabled ? "TEAM_MEMBER_DISABLED" : "TEAM_MEMBER_ENABLED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true, navigationRequested: true, navigationStatus: "COMPLETED", candidateNames: [resolution.member.fullName ?? resolution.member.email] }) };
  },
};
