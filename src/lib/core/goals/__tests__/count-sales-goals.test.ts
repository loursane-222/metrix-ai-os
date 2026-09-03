import { beforeEach, describe, expect, it, vi } from "vitest";

const { count } = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { salesGoal: { count } } }));

import { countSalesGoalsForOrganization } from "../goal.repository";

describe("countSalesGoalsForOrganization", () => {
  beforeEach(() => { count.mockReset(); });

  it("returns the real, unbounded total (not capped like listSalesGoalsForOrganization's take:50)", async () => {
    count.mockResolvedValue(63);
    const result = await countSalesGoalsForOrganization({ organizationId: "org-1" });
    expect(count).toHaveBeenCalledWith({ where: { organizationId: "org-1" } });
    expect(result).toBe(63);
  });

  it("applies period/status filters when provided, same as the list function", async () => {
    count.mockResolvedValue(4);
    await countSalesGoalsForOrganization({ organizationId: "org-1", period: "QUARTERLY", status: "ACTIVE" });
    expect(count).toHaveBeenCalledWith({ where: { organizationId: "org-1", period: "QUARTERLY", status: "ACTIVE" } });
  });
});
