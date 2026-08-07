import { describe, expect, it, vi } from "vitest";
import { OrganizationRole } from "@prisma/client";
import { resolveExecutionPermissions } from "@/lib/action-runtime/gateway/execution-context";
import { activateInvitedMemberships } from "@/lib/application/auth/invitation-activation";
import { projectBusinessNavigation, resolveBusinessNavigation } from "@/lib/executive-request-resolution/business-navigation";

describe("organization member invitation phase 1", () => {
  it("activates pending memberships inside verified-login transaction", async () => {
    const update = vi.fn().mockResolvedValue({ id: "user-b" });
    await activateInvitedMemberships("user-b", { user: { update } } as never);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-b" },
      data: { memberships: { updateMany: { where: { status: "INVITED" }, data: expect.objectContaining({ status: "ACTIVE" }) } } },
    }));
  });

  it("allows invitations only for owner and executive permission sets", () => {
    expect(resolveExecutionPermissions(OrganizationRole.OWNER)).toContain("members.manage");
    expect(resolveExecutionPermissions(OrganizationRole.EXECUTIVE)).toContain("members.manage");
    expect(resolveExecutionPermissions(OrganizationRole.MANAGER)).not.toContain("members.manage");
    expect(resolveExecutionPermissions(OrganizationRole.TEAM_LEAD)).not.toContain("members.manage");
    expect(resolveExecutionPermissions(OrganizationRole.EMPLOYEE)).not.toContain("members.manage");
  });

  it("projects the chat team command to the safe management surface", async () => {
    const resolution = await resolveBusinessNavigation({
      understanding: { conversationKind: "company_related", userMotivation: "kayit_islem", companyRelevance: "high", actionExpectation: "explicit", confidence: "high", shouldAskClarification: false, shouldInvokeExecutiveBrain: true, suggestedHandling: "executive_reasoning", businessNavigation: { operation: "NAVIGATE", domain: "team", target: "create", entityReference: null }, reasoning: { summary: "", observations: [], uncertainty: [], whyThisHandling: "" } },
      listCustomers: async () => [],
    });
    expect(resolution.status).toBe("RESOLVED");
    if (resolution.status === "RESOLVED") expect(projectBusinessNavigation(resolution.descriptor)).toEqual({ route: "/metrix/team", expectedSurfaceAuthorityKey: "team.members.page" });
  });
});
