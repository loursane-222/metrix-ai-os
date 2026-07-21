import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { claimFirstExperienceOpening } from "../first-experience.repository";

describe("first experience repository idempotency", () => {
  it("claims NOT_STARTED with one conditional server update", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const claimed = await claimFirstExperienceOpening("org_1", { organization: { updateMany } } as never);
    expect(claimed).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org_1", onboardingStatus: "NOT_STARTED" } }));
  });

  it("rejects a duplicate claim after another request/device wins", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    expect(await claimFirstExperienceOpening("org_1", { organization: { updateMany } } as never)).toBe(false);
  });
});
