import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { teamHandoff } from "./conversation-extension-handoff";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";

// Residual Capability Parity Migration: this extension is narrowed to ONLY
// its pure "ekibi göster" navigation branch — invite/role-change/toggle are
// retired. organization_member.update (role change, enable/disable) was
// already a canonical Action Registry action; organization_member.create
// (invite) is a NEW one added this operation (team.actions.ts), both
// wrapping the exact same canonical services
// (inviteOrganizationMember/manageOrganizationMember) this extension's own
// fetch calls used to hit via POST/PATCH /api/organization-members. Both
// are now reachable through the Executive Agent's execute_business_action
// tool, with memberId resolvable by plain-language name via
// entity-resolvers.ts's new "organizationMember" domain (reusing the exact
// resolveByLabel algorithm every other domain already uses) — so the Agent
// never needs to guess a real id.
const LIST_TEAM = /^(?:ekibi\s+g[oö]ster|ekip\s+listesini\s+g[oö]ster)[.!]?$/iu;

function navigate(source: ConversationExtensionSource, correlationId: string): void {
  if (typeof window !== "undefined") void dispatchConversationNavigation({ route: "/metrix/team", source, correlationId, expectedSurfaceAuthorityKey: "team.members.page" });
}

export const teamManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey: () => typeof window === "undefined" ? null : `team-management:${window.location.pathname}`,
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!LIST_TEAM.test(text)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return { status: "HANDOFF", handoff: teamHandoff({ operation: "NAVIGATE", outcomeCode: "TEAM_LIST_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
  },
};
