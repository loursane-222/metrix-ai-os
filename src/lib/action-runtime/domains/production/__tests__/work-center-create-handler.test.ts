import { beforeEach, describe, expect, it, vi } from "vitest";

const { createNewWorkCenterMock } = vi.hoisted(() => ({ createNewWorkCenterMock: vi.fn() }));
vi.mock("@/lib/core/production/production.service", () => ({ createNewWorkCenter: createNewWorkCenterMock }));

import { handleWorkCenterCreate } from "../work-center-create-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "workCenter.create",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["production.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleWorkCenterCreate", () => {
  beforeEach(() => createNewWorkCenterMock.mockReset());

  it("creates a work center through the canonical service", async () => {
    createNewWorkCenterMock.mockResolvedValue({ id: "wc-1", name: "Kesim Hattı" });

    const result = await handleWorkCenterCreate(envelope({ name: "Kesim Hattı", code: "WC-1" }));

    expect(createNewWorkCenterMock).toHaveBeenCalledWith({ organizationId: "org-1", name: "Kesim Hattı", code: "WC-1", notes: undefined });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "work_center", entityId: "wc-1" } });
  });

  it("rejects a missing code before mutation", async () => {
    await expect(handleWorkCenterCreate(envelope({ name: "Kesim Hattı" }))).rejects.toThrow(/code/);
    expect(createNewWorkCenterMock).not.toHaveBeenCalled();
  });
});
