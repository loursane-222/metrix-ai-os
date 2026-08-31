import { describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { settlement: { findMany } } }));

import { listSettlementsForOrganizationInRange } from "../settlement.repository";

// Phase D1 correction: the canonical collection-event query moved from
// Payment.paidAt to Settlement.occurredAt — this must preserve exactly the
// same tenant-isolation guarantee the original Payment-based query had.
describe("listSettlementsForOrganizationInRange — tenant isolation", () => {
  it("always scopes the query by the caller's organizationId", async () => {
    const range = { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") };
    await listSettlementsForOrganizationInRange("org-abc", range);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-abc" }) }),
    );
  });

  it("filters by occurredAt, not by any Payment field", async () => {
    const range = { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") };
    await listSettlementsForOrganizationInRange("org-abc", range);
    const call = findMany.mock.calls[0]![0] as { where: { occurredAt: { gte: Date; lt: Date } } };
    expect(call.where.occurredAt).toEqual({ gte: range.from, lt: range.to });
  });

  it("a different organizationId produces a different scope — no cross-tenant bleed from a shared query shape", async () => {
    findMany.mockClear();
    const range = { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") };
    await listSettlementsForOrganizationInRange("org-a", range);
    await listSettlementsForOrganizationInRange("org-b", range);
    const scopes = findMany.mock.calls.map((call) => (call[0] as { where: { organizationId: string } }).where.organizationId);
    expect(scopes).toEqual(["org-a", "org-b"]);
  });
});
