import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { getOwnMembershipIdMock, listOrganizationMembersMock, manageOrganizationMemberMock } = vi.hoisted(() => ({
  getOwnMembershipIdMock: vi.fn(),
  listOrganizationMembersMock: vi.fn(),
  manageOrganizationMemberMock: vi.fn(),
}));
vi.mock("@/lib/core/organization-members/organization-member.service", () => ({
  getOwnMembershipId: getOwnMembershipIdMock,
  listOrganizationMembers: listOrganizationMembersMock,
  manageOrganizationMember: manageOrganizationMemberMock,
}));

import { organizationMemberUpdateHandler } from "../organization-member-update-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "organization_member.update",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: ["members.manage"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("organizationMemberUpdateHandler", () => {
  beforeEach(() => {
    getOwnMembershipIdMock.mockReset();
    listOrganizationMembersMock.mockReset();
    manageOrganizationMemberMock.mockReset();
    getOwnMembershipIdMock.mockResolvedValue("actor-member-1");
    listOrganizationMembersMock.mockResolvedValue([{ id: "member-1", email: "a@b.com", fullName: "Ali", role: "EMPLOYEE", status: "ACTIVE", joinedAt: new Date() }]);
  });

  it("resolves the actor's own membership id and forwards it as actorMemberId to the canonical service", async () => {
    manageOrganizationMemberMock.mockResolvedValue({ id: "member-1", email: "a@b.com", fullName: "Ali", role: "MANAGER", status: "ACTIVE" });
    const result = await organizationMemberUpdateHandler(envelope({ memberId: "member-1", role: "MANAGER" }));
    expect(getOwnMembershipIdMock).toHaveBeenCalledWith("org-1", "actor-1");
    expect(manageOrganizationMemberMock).toHaveBeenCalledWith({ organizationId: "org-1", memberId: "member-1", actorMemberId: "actor-member-1", role: "MANAGER", disabled: undefined });
    expect(result.status).toBe("SUCCESS");
    expect(result.metadata?.changedFields).toEqual(["role"]);
  });

  it("captures the previous role/status for compensation", async () => {
    manageOrganizationMemberMock.mockResolvedValue({ id: "member-1", email: "a@b.com", fullName: "Ali", role: "MANAGER", status: "DISABLED" });
    const result = await organizationMemberUpdateHandler(envelope({ memberId: "member-1", role: "MANAGER", disabled: true }));
    expect(result.compensationSnapshot).toEqual({ memberId: "member-1", role: "EMPLOYEE", disabled: false });
  });

  it("rejects when neither role nor disabled is provided", async () => {
    await expect(organizationMemberUpdateHandler(envelope({ memberId: "member-1" }))).rejects.toThrow(/role or disabled/);
    expect(manageOrganizationMemberMock).not.toHaveBeenCalled();
  });

  it("rejects a missing memberId before any lookup", async () => {
    await expect(organizationMemberUpdateHandler(envelope({ role: "MANAGER" }))).rejects.toThrow(/memberId/);
    expect(getOwnMembershipIdMock).not.toHaveBeenCalled();
  });

  it("throws when the acting user has no membership in this organization", async () => {
    getOwnMembershipIdMock.mockResolvedValue(null);
    await expect(organizationMemberUpdateHandler(envelope({ memberId: "member-1", role: "MANAGER" }))).rejects.toThrow(/Acting member not found/);
    expect(manageOrganizationMemberMock).not.toHaveBeenCalled();
  });

  it("propagates the self-disable guard error from the canonical service unchanged", async () => {
    manageOrganizationMemberMock.mockRejectedValue(new Error("Kendi üyeliğinizi devre dışı bırakamazsınız."));
    await expect(organizationMemberUpdateHandler(envelope({ memberId: "member-1", disabled: true }))).rejects.toThrow(/Kendi üyeliğinizi/);
  });
});
