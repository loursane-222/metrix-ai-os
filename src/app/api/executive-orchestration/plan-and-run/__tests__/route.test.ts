import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  requireAuthContextFromCookiesMock,
  resolveGeneralOrchestrationPlanMock,
  runOrchestrationMock,
  findLastAiMessageByConversationMock,
} = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  resolveGeneralOrchestrationPlanMock: vi.fn(),
  runOrchestrationMock: vi.fn(),
  findLastAiMessageByConversationMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({ requireAuthContextFromCookies: requireAuthContextFromCookiesMock }));
vi.mock("@/lib/executive-orchestration/general-plan-resolver", () => ({ resolveGeneralOrchestrationPlan: resolveGeneralOrchestrationPlanMock }));
vi.mock("@/lib/executive-orchestration/executive-orchestration.service", () => ({ runOrchestration: runOrchestrationMock }));
vi.mock("@/lib/core/conversations/conversation.repository", () => ({ findLastAiMessageByConversation: findLastAiMessageByConversationMock }));

import { POST } from "../route";

const authContext = {
  user: { id: "user-1" },
  organization: { id: "org-1" },
  membership: { role: "OWNER" },
  session: { id: "session-1", createdAt: new Date(), expiresAt: new Date() },
};

function buildRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/executive-orchestration/plan-and-run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/executive-orchestration/plan-and-run — conversation continuity plumbing", () => {
  beforeEach(() => {
    requireAuthContextFromCookiesMock.mockReset().mockResolvedValue(authContext);
    resolveGeneralOrchestrationPlanMock.mockReset().mockResolvedValue({ status: "NOT_HANDLED" });
    runOrchestrationMock.mockReset();
    findLastAiMessageByConversationMock.mockReset().mockResolvedValue(null);
  });

  it("omitting conversationId (existing callers) never looks up prior context — byte-for-byte unchanged", async () => {
    await POST(buildRequest({ utterance: "bir görev tamamla" }));
    expect(findLastAiMessageByConversationMock).not.toHaveBeenCalled();
    expect(resolveGeneralOrchestrationPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({ utterance: "bir görev tamamla", previousContext: null }),
    );
  });

  it("a conversationId looks up that organization's own persisted last-successful-operation context and passes it to the resolver", async () => {
    findLastAiMessageByConversationMock.mockResolvedValue({
      metadata: {
        lastSuccessfulOperationContext: {
          version: "v1", operation: "UPDATE", domain: "tasks", entityId: "task-1", entityDisplayName: "Takip",
          outcomeCode: "TASK_COMPLETED", occurredAt: "2026-01-01T00:00:00.000Z", sourceMessageId: "m1", organizationId: "org-1",
        },
      },
    });

    await POST(buildRequest({ utterance: "onu da tamamla", conversationId: "conv-1" }));

    expect(findLastAiMessageByConversationMock).toHaveBeenCalledWith("conv-1", "org-1");
    expect(resolveGeneralOrchestrationPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        utterance: "onu da tamamla",
        previousContext: expect.objectContaining({ domain: "tasks", entityId: "task-1" }),
      }),
    );
  });

  it("never trusts a client-supplied entity — only conversationId (opaque reference) is read from the request body", async () => {
    await POST(buildRequest({
      utterance: "bir şey yap",
      conversationId: "conv-1",
      // A malicious/buggy client sending its own "canonical" entity claim must be ignored entirely.
      previousContext: { domain: "customer", entityId: "cust-HACKED" },
    }));
    const call = resolveGeneralOrchestrationPlanMock.mock.calls[0]![0];
    expect(call.previousContext).toBeNull();
  });
});
