import { afterEach, describe, expect, it, vi } from "vitest";
import { customerAttachmentConversationCoordinator } from "@/lib/customers/customer-attachment-conversation-coordinator";
import { customerManagementConversationExtension } from "../customer-management-conversation-extension";

describe("customerManagementConversationExtension", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports bounded telemetry and returns Turkish executive guidance without exposing payloads", async () => {
    const privatePayload = "Atlas Yapı customer@example.com 0532 111 22 33";
    vi.spyOn(customerAttachmentConversationCoordinator, "execute").mockRejectedValue(new Error(privatePayload));
    const telemetry = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(customerManagementConversationExtension.execute("full private utterance")).resolves.toEqual({
      status: "HANDLED_FAILED",
      message: "Müşteri işlemi güvenli biçimde tamamlanamadı. Bilgileri kontrol edip tekrar dener misin?",
    });
    expect(telemetry).toHaveBeenCalledWith("[CustomerManagementExtension] operation failed", {
      errorName: "Error",
      errorMessage: "Unexpected operation failure",
      stage: "attachment",
    });
    const logged = JSON.stringify(telemetry.mock.calls);
    expect(logged).not.toContain(privatePayload);
    expect(logged).not.toContain("full private utterance");
  });
});
