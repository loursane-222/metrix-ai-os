import { describe, expect, it, vi } from "vitest";

const { requestOrchestrationPlanAndRunMock } = vi.hoisted(() => ({ requestOrchestrationPlanAndRunMock: vi.fn() }));
vi.mock("@/lib/executive-orchestration/executive-orchestration-client", () => ({
  requestOrchestrationPlanAndRun: requestOrchestrationPlanAndRunMock,
}));

import { orchestrationConversationExtension } from "../orchestration-conversation-extension";

describe("orchestrationConversationExtension — compensation outcomes", () => {
  // Regression: an orchestration that fails but gets fully reversed, or
  // whose reversal itself fails, must never be narrated as success or
  // silently folded into the generic FAILED branch — see
  // executive-orchestration.service.ts's runCompensationPass.
  it("produces a distinct outcomeCode for COMPENSATED (failed but cleanly reversed)", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({
      status: "RUN_COMPLETE",
      summary: "2 adımlı bir işlem",
      orchestration: { id: "o1", status: "COMPENSATED", triggerUtterance: "sipariş oluştur, sonra fatura kes", steps: [] },
    });

    const result = await orchestrationConversationExtension.execute("sipariş oluştur, sonra fatura kes");

    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("ORCHESTRATION_COMPENSATED");
    expect(result.handoff?.resultStatus).toBe("FAILED");
  });

  it("produces a distinct, loudly-surfaced outcomeCode for COMPENSATION_FAILED", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({
      status: "RUN_COMPLETE",
      summary: "2 adımlı bir işlem",
      orchestration: { id: "o1", status: "COMPENSATION_FAILED", triggerUtterance: "sipariş oluştur, sonra fatura kes", steps: [] },
    });

    const result = await orchestrationConversationExtension.execute("sipariş oluştur, sonra fatura kes");

    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("ORCHESTRATION_COMPENSATION_FAILED");
    expect(result.handoff?.resultStatus).toBe("FAILED");
  });

  it("produces PLAN_INVALID when the resolver rejects an irreversible-not-last plan", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({ status: "PLAN_INVALID", reason: "quote.dispatch must be last" });

    const result = await orchestrationConversationExtension.execute("teklifi gönder, sonra görev oluştur");

    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("ORCHESTRATION_PLAN_INVALID");
    expect(result.handoff?.resultStatus).toBe("FAILED");
  });
});
