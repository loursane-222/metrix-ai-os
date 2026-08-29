import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueOrThrowMock, findFirstMock, findOrganizationContextByUserIdMock } = vi.hoisted(() => ({
  findUniqueOrThrowMock: vi.fn(),
  findFirstMock: vi.fn(),
  findOrganizationContextByUserIdMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { user: { findUniqueOrThrow: findUniqueOrThrowMock }, session: { findFirst: findFirstMock } },
}));
vi.mock("../organization-context.repository", () => ({
  findOrganizationContextByUserId: findOrganizationContextByUserIdMock,
}));

import { buildAuthContextForOrganizationMember } from "../auth-context-for-member";

describe("buildAuthContextForOrganizationMember", () => {
  beforeEach(() => {
    findUniqueOrThrowMock.mockReset();
    findFirstMock.mockReset();
    findOrganizationContextByUserIdMock.mockReset();
  });

  it("assembles a real AuthContext from a userId with no live session/cookies", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ id: "user-1", fullName: "Ahmet Yılmaz" });
    findOrganizationContextByUserIdMock.mockResolvedValue({ organization: { id: "org-1" }, membership: { role: "EMPLOYEE" } });
    findFirstMock.mockResolvedValue({ id: "session-1", createdAt: new Date("2026-08-01T00:00:00.000Z") });

    const result = await buildAuthContextForOrganizationMember("user-1", "org-1");

    expect(result).toEqual({
      user: { id: "user-1", fullName: "Ahmet Yılmaz" },
      organization: { id: "org-1" },
      membership: { role: "EMPLOYEE" },
      session: { id: "session-1", createdAt: new Date("2026-08-01T00:00:00.000Z") },
    });
    expect(findFirstMock).toHaveBeenCalledWith({ where: { userId: "user-1" }, orderBy: { createdAt: "desc" } });
  });

  it("throws when the user has no membership in the given organization", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ id: "user-1" });
    findOrganizationContextByUserIdMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue({ id: "session-1" });

    await expect(buildAuthContextForOrganizationMember("user-1", "org-1")).rejects.toThrow("ORGANIZATION_MEMBER_NOT_FOUND");
  });

  it("throws when the user has never had a session", async () => {
    findUniqueOrThrowMock.mockResolvedValue({ id: "user-1" });
    findOrganizationContextByUserIdMock.mockResolvedValue({ organization: { id: "org-1" }, membership: {} });
    findFirstMock.mockResolvedValue(null);

    await expect(buildAuthContextForOrganizationMember("user-1", "org-1")).rejects.toThrow("ORGANIZATION_MEMBER_HAS_NO_SESSION");
  });
});
