import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { organizationMember: { findFirst } } }));

import { findMembershipIdForUser } from "../organization-member.repository";

describe("findMembershipIdForUser", () => {
  beforeEach(() => { findFirst.mockReset(); });

  it("returns the membership id for a user that belongs to the organization", async () => {
    findFirst.mockResolvedValue({ id: "member-1" });
    const result = await findMembershipIdForUser("org-1", "user-1");
    expect(findFirst).toHaveBeenCalledWith({ where: { organizationId: "org-1", userId: "user-1" }, select: { id: true } });
    expect(result).toBe("member-1");
  });

  it("returns null when the user has no membership in this organization", async () => {
    findFirst.mockResolvedValue(null);
    expect(await findMembershipIdForUser("org-1", "user-2")).toBeNull();
  });
});
