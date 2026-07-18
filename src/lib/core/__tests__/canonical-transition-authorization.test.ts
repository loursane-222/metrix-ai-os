import { describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  memoryItem: { updateMany: vi.fn(), findFirst: vi.fn() },
  memoryCandidate: { updateMany: vi.fn(), findFirst: vi.fn() },
  executiveDecisionRecord: {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: prismaMocks }));

import { markDeleted, markSuperseded } from "@/lib/core/memory-items/memory-item.repository";
import {
  markApproved,
  markDismissed,
  markExpired,
  markRejected,
} from "@/lib/core/memory-candidates/memory-candidate.repository";
import {
  closeExecutiveDecisionRecord,
  markExecutiveDecisionRecordCommitted,
} from "@/lib/executive-decision-loop/executive-decision-record.repository";
import { authorizeExecutiveDecisionRecordTransition } from "@/lib/executive-decision-loop/executive-decision-transition-authorization";

describe("canonical lifecycle repository authorization", () => {
  it("rejects MemoryItem delete and supersede without issued capabilities", async () => {
    await expect(markDeleted({} as never)).rejects.toThrow("Invalid MemoryItem DELETE");
    await expect(markSuperseded({} as never)).rejects.toThrow("Invalid MemoryItem SUPERSEDE");
    expect(prismaMocks.memoryItem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects every MemoryCandidate transition without issued capabilities", async () => {
    await expect(markApproved({} as never)).rejects.toThrow("Invalid MemoryCandidate APPROVE");
    await expect(markRejected({} as never)).rejects.toThrow("Invalid MemoryCandidate REJECT");
    await expect(markDismissed({} as never)).rejects.toThrow("Invalid MemoryCandidate DISMISS");
    await expect(markExpired({} as never)).rejects.toThrow("Invalid MemoryCandidate EXPIRE");
    expect(prismaMocks.memoryCandidate.updateMany).not.toHaveBeenCalled();
  });

  it("rejects Decision commit and close without issued capabilities", async () => {
    const input = {
      id: "decision-1",
      conversationId: "conversation-1",
      sourceMessageId: "message-1",
      committedAt: new Date(),
      followUpDueAt: null,
    };
    await expect(markExecutiveDecisionRecordCommitted(input, {} as never))
      .rejects.toThrow("Invalid ExecutiveDecisionRecord COMMIT");
    await expect(closeExecutiveDecisionRecord({
      id: input.id,
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      closedAt: new Date(),
    }, {} as never)).rejects.toThrow("Invalid ExecutiveDecisionRecord CLOSE");
  });

  it("accepts a valid bound Decision transition and rejects invalid state transitions", async () => {
    prismaMocks.executiveDecisionRecord.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMocks.executiveDecisionRecord.findFirst.mockResolvedValueOnce({
      id: "decision-1",
      organizationId: "org-1",
      status: "COMMITTED",
    });
    const authorization = authorizeExecutiveDecisionRecordTransition({
      transition: "COMMIT",
      organizationId: "org-1",
      targetId: "decision-1",
      fromStatus: "PROPOSED",
      sourceService: "test",
    });
    await expect(markExecutiveDecisionRecordCommitted({
      id: "decision-1",
      conversationId: "conversation-1",
      sourceMessageId: "message-1",
      committedAt: new Date(),
      followUpDueAt: null,
    }, authorization)).resolves.toMatchObject({ status: "COMMITTED" });

    expect(() => authorizeExecutiveDecisionRecordTransition({
      transition: "CLOSE",
      organizationId: "org-1",
      targetId: "decision-1",
      fromStatus: "PROPOSED",
      sourceService: "test",
    })).toThrow("Invalid ExecutiveDecisionRecord transition");
  });
});
