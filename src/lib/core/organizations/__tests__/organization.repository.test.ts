import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { organization: { findMany: findManyMock } },
}));

import { listOrganizationsForDailyBriefing } from "../organization.repository";

describe("listOrganizationsForDailyBriefing", () => {
  beforeEach(() => findManyMock.mockReset());

  it("counts only ACTIVE members and projects briefing-safe fields", async () => {
    findManyMock.mockResolvedValue([{
      id: "org-1",
      name: "Şirket",
      industry: null,
      companySize: null,
      country: "TR",
      city: null,
      description: null,
      _count: { members: 2 },
    }]);

    await expect(listOrganizationsForDailyBriefing()).resolves.toEqual([{
      id: "org-1",
      name: "Şirket",
      industry: null,
      companySize: null,
      country: "TR",
      city: null,
      description: null,
      activeMemberCount: 2,
    }]);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      }),
    }));
  });
});
