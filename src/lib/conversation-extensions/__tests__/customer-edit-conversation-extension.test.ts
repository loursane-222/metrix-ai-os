import { afterEach, describe, expect, it, vi } from "vitest";

const { describeMock, descriptorMock, resolveAndDispatchMock } = vi.hoisted(() => ({
  describeMock: vi.fn(),
  descriptorMock: vi.fn(),
  resolveAndDispatchMock: vi.fn(),
}));

vi.mock("@/lib/customers/customer-edit-command-integration", () => ({
  describeCustomerEditCommandExecutionResult: describeMock,
  resolveAndDispatchCustomerEditSurfaceCommand: resolveAndDispatchMock,
}));
vi.mock("@/lib/customers/customer-edit-surface-command-channel", () => ({
  getActiveCustomerEditSurfaceDescriptor: descriptorMock,
}));

import { customerEditConversationExtension } from "../customer-edit-conversation-extension";

describe("customerEditConversationExtension", () => {
  afterEach(() => vi.clearAllMocks());

  it("exposes the active surface token and entity as its idempotency scope", () => {
    descriptorMock.mockReturnValue({ token: "surface-1", entityId: "cust-1", activeTab: "identity" });
    expect(customerEditConversationExtension.getActiveScopeKey()).toBe("customer-edit:surface-1:cust-1");
  });

  it("maps successful commands to one handled result", async () => {
    resolveAndDispatchMock.mockResolvedValue({ status: "EXECUTED", command: { type: "commit" } });
    describeMock.mockReturnValue("Degisiklikler kaydedildi.");

    await expect(customerEditConversationExtension.execute("Kaydet")).resolves.toMatchObject({
      status: "HANDOFF", handoff: { operation: "UPDATE", resultStatus: "EXECUTED", mutationPerformed: true },
    });
  });

  it("handles select_tab without requesting a redundant assistant bubble", async () => {
    resolveAndDispatchMock.mockResolvedValue({ status: "EXECUTED", command: { type: "select_tab", tabId: "official" } });
    describeMock.mockReturnValue(null);

    await expect(customerEditConversationExtension.execute("Resmi bilgiler")).resolves.toMatchObject({
      status: "HANDOFF", handoff: { outcomeCode: "CUSTOMER_EDIT_EXECUTED" },
    });
  });

  it("maps clarification and failures to handled outcomes", async () => {
    resolveAndDispatchMock.mockResolvedValueOnce({ status: "CLARIFICATION_REQUIRED", message: "Hangi alan?" });
    describeMock.mockReturnValueOnce("Hangi alan?");
    await expect(customerEditConversationExtension.execute("Degistir")).resolves.toMatchObject({
      status: "HANDOFF", handoff: { resultStatus: "CLARIFICATION_REQUIRED" },
    });

    resolveAndDispatchMock.mockResolvedValueOnce({ status: "VALIDATION_FAILED", reason: "invalid" });
    describeMock.mockReturnValueOnce(null);
    await expect(customerEditConversationExtension.execute("???")).resolves.toMatchObject({ status: "HANDOFF", handoff: { resultStatus: "FAILED" } });
  });

  it("maps unsupported and absent surfaces to NOT_HANDLED", async () => {
    resolveAndDispatchMock.mockResolvedValueOnce({ status: "UNSUPPORTED" }).mockResolvedValueOnce(null);

    await expect(customerEditConversationExtension.execute("Hava nasil?")).resolves.toMatchObject({ status: "NOT_HANDLED" });
    await expect(customerEditConversationExtension.execute("Merhaba")).resolves.toMatchObject({ status: "NOT_HANDLED" });
  });
});
