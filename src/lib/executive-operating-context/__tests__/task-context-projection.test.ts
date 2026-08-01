import { describe, expect, it, vi } from "vitest";

// executive-operating-context-builder.service.ts transitively imports
// @/lib/core/shared/prisma (via domain-evidence.repository.ts) at module
// scope, which constructs a real PrismaClient and throws without
// DATABASE_URL. Must be mocked before importing, same as
// customer.service.test.ts / production-execution-runtime.test.ts.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { projectTaskContext } from "../executive-operating-context-builder.service";
import type { DomainEvidenceV1 } from "@/lib/domain-evidence";

const now = new Date("2026-08-01T12:00:00Z");

function taskEvidence(overrides: Partial<{
  id: string; status: string; priority: string; dueDate: string | null; assigneeUserId: string | null;
}>): DomainEvidenceV1 {
  const id = overrides.id ?? "t-1";
  return {
    evidenceId: `tasks:${id}`,
    evidenceType: "TASK_RECORD",
    sourceDomain: "tasks",
    sourceRecordId: id,
    organizationId: "org-1",
    observedAt: now.toISOString(),
    verificationStatus: "CANONICAL",
    provenance: { owner: "CANONICAL_DOMAIN_RECORD", repository: "Task" },
    adapterId: "task-evidence",
    adapterVersion: "1.0",
    confidence: 0.9,
    summary: "canonical task",
    managementCategory: "operations",
    projection: {
      title: `Task ${id}`,
      status: overrides.status ?? "OPEN",
      priority: overrides.priority ?? "MEDIUM",
      dueDate: overrides.dueDate ?? null,
      assigneeUserId: overrides.assigneeUserId ?? null,
    },
  };
}

describe("projectTaskContext", () => {
  it("returns real zeros when there is no canonical Task evidence, without fabricating data", () => {
    const context = projectTaskContext([], now);
    expect(context).toEqual({
      openCount: 0, overdueCount: 0, dueTodayCount: 0, completedCount: 0,
      priorityBreakdown: { LOW: 0, MEDIUM: 0, HIGH: 0 },
      assigneeDistribution: [], openItems: [],
    });
  });

  it("computes open, overdue, due-today, completed and priority counts from real evidence", () => {
    const evidence = [
      taskEvidence({ id: "t-open", status: "OPEN", priority: "HIGH", dueDate: null }),
      taskEvidence({ id: "t-overdue", status: "OPEN", priority: "MEDIUM", dueDate: "2026-07-30T00:00:00Z" }),
      taskEvidence({ id: "t-due-today", status: "OPEN", priority: "LOW", dueDate: "2026-08-01T09:00:00Z" }),
      taskEvidence({ id: "t-future", status: "OPEN", priority: "LOW", dueDate: "2026-09-01T00:00:00Z" }),
      taskEvidence({ id: "t-done", status: "DONE", priority: "MEDIUM", dueDate: "2026-07-01T00:00:00Z" }),
    ];

    const context = projectTaskContext(evidence, now);

    expect(context.openCount).toBe(4);
    expect(context.overdueCount).toBe(1);
    expect(context.dueTodayCount).toBe(1);
    expect(context.completedCount).toBe(1);
    expect(context.priorityBreakdown).toEqual({ LOW: 2, MEDIUM: 1, HIGH: 1 });
  });

  it("computes assignee distribution over open tasks including unassigned", () => {
    const evidence = [
      taskEvidence({ id: "t-a", status: "OPEN", assigneeUserId: "user-1" }),
      taskEvidence({ id: "t-b", status: "OPEN", assigneeUserId: "user-1" }),
      taskEvidence({ id: "t-c", status: "OPEN", assigneeUserId: "user-2" }),
      taskEvidence({ id: "t-d", status: "OPEN", assigneeUserId: null }),
    ];

    const context = projectTaskContext(evidence, now);

    expect(context.assigneeDistribution).toEqual(
      expect.arrayContaining([
        { assigneeUserId: "user-1", count: 2 },
        { assigneeUserId: "user-2", count: 1 },
        { assigneeUserId: null, count: 1 },
      ]),
    );
  });

  it("ignores non-task evidence types", () => {
    const context = projectTaskContext([{ ...taskEvidence({}), evidenceType: "CUSTOMER_RECORD" }], now);
    expect(context.openCount).toBe(0);
  });
});
