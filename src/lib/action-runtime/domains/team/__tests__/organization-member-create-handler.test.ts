import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { inviteOrganizationMemberMock } = vi.hoisted(() => ({
  inviteOrganizationMemberMock: vi.fn(),
}));
vi.mock("@/lib/core/organization-members/organization-member.service", () => ({
  inviteOrganizationMember: inviteOrganizationMemberMock,
}));

import { organizationMemberCreateHandler } from "../organization-member-create-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "organization_member.create",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: ["members.manage"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("organizationMemberCreateHandler", () => {
  beforeEach(() => { inviteOrganizationMemberMock.mockReset(); });

  it("invites via the exact same canonical service the legacy POST /api/organization-members route already used", async () => {
    inviteOrganizationMemberMock.mockResolvedValue({ id: "member-1", email: "ayse@example.com", role: "MANAGER", status: "INVITED" });
    const result = await organizationMemberCreateHandler(envelope({ email: "AYSE@Example.com", role: "MANAGER" }));
    expect(inviteOrganizationMemberMock).toHaveBeenCalledWith({ organizationId: "org-1", email: "AYSE@Example.com", role: "MANAGER" });
    expect(result.status).toBe("SUCCESS");
    expect(result.entityRef).toEqual({ entityType: "organization_member", entityId: "member-1" });
    expect(result.metadata).toEqual({ role: "MANAGER", status: "INVITED" });
  });

  it("rejects a missing email before calling the service", async () => {
    await expect(organizationMemberCreateHandler(envelope({ role: "MANAGER" }))).rejects.toThrow(/email/);
    expect(inviteOrganizationMemberMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid role before calling the service", async () => {
    await expect(organizationMemberCreateHandler(envelope({ email: "a@b.com", role: "SUPERADMIN" }))).rejects.toThrow(/role/);
    expect(inviteOrganizationMemberMock).not.toHaveBeenCalled();
  });

  it("propagates a duplicate/invalid-email error from the canonical service unchanged", async () => {
    inviteOrganizationMemberMock.mockRejectedValue(new Error("Geçerli bir e-posta adresi girin."));
    await expect(organizationMemberCreateHandler(envelope({ email: "not-an-email", role: "EMPLOYEE" }))).rejects.toThrow(/e-posta/);
  });
});
