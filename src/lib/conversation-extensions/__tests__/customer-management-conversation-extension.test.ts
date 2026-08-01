import { afterEach, describe, expect, it, vi } from "vitest";
import { customerAttachmentConversationCoordinator } from "@/lib/customers/customer-attachment-conversation-coordinator";
import { customerCustomFieldConversationCoordinator } from "@/lib/customers/customer-custom-field-conversation";
import { customerManagementConversationExtension } from "../customer-management-conversation-extension";
import { customerCreateConversationCoordinator } from "@/lib/customers/customer-create-conversation-coordinator";

describe("customerManagementConversationExtension", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["Atlas müşterisini aç.", "Atlas müşterisini göster.", "Atlas müşterisini düzenle."])("does not claim canonical existing-customer navigation: %s", async (utterance) => {
    vi.spyOn(customerAttachmentConversationCoordinator, "execute").mockResolvedValue({ handled: false, outcome: "NOT_ATTACHMENT_INTENT", message: null });
    vi.spyOn(customerCustomFieldConversationCoordinator, "execute").mockResolvedValue({ handled: false, status: "EXECUTED", message: null });
    const create = vi.spyOn(customerCreateConversationCoordinator, "execute");

    await expect(customerManagementConversationExtension.execute(utterance, "written", "turn-navigation")).resolves.toEqual({ status: "NOT_HANDLED", handoff: null });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports bounded telemetry and hands failure evidence to canonical chat without exposing payloads", async () => {
    const privatePayload = "Atlas Yapı customer@example.com 0532 111 22 33";
    vi.spyOn(customerAttachmentConversationCoordinator, "execute").mockRejectedValue(new Error(privatePayload));
    const telemetry = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lifecycle = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(customerManagementConversationExtension.execute("full private utterance", "voice", "turn-private-1")).resolves.toMatchObject({
      status: "HANDOFF",
      handoff: { resultStatus: "FAILED", failureCode: "UNKNOWN_NAVIGATION_FAILURE" },
    });
    expect(telemetry).toHaveBeenCalledWith("[CustomerManagementExtension] operation failed", {
      errorName: "Error",
      errorMessage: "Unexpected operation failure",
      stage: "attachment",
    });
    const logged = JSON.stringify(telemetry.mock.calls);
    expect(logged).not.toContain(privatePayload);
    expect(logged).not.toContain("full private utterance");
    const lifecycleLogged = JSON.stringify(lifecycle.mock.calls);
    expect(lifecycleLogged).toContain("extension_started");
    expect(lifecycleLogged).toContain("stage_selected");
    expect(lifecycleLogged).toContain("extension_failed");
    expect(lifecycleLogged).toContain("turn-private-1");
    expect(lifecycleLogged).not.toContain(privatePayload);
    expect(lifecycleLogged).not.toContain("full private utterance");
  });

  it("hands the production enrichment to canonical chat without navigation ownership", async () => {
    const utterance = "Atlas artık euro ile çalışıyor. Önümüzdeki hafta da yeni fiyat teklifi istemeleri muhtemel.";
    vi.spyOn(customerAttachmentConversationCoordinator, "execute").mockResolvedValue({ handled: false, outcome: "NOT_ATTACHMENT_INTENT", message: null });
    vi.spyOn(customerCustomFieldConversationCoordinator, "execute").mockResolvedValue({ handled: false, status: "EXECUTED", message: null });
    const lifecycle = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(customerManagementConversationExtension.execute(utterance, "written", "turn-atlas-production")).resolves.toMatchObject({
      status: "HANDOFF",
      handoff: {
        operation: "ENRICH",
        fieldNames: ["currency"],
        navigationRequested: false,
        certainty: "PROBABLE_CONTEXT_PRESENT",
      },
    });
    const logged = JSON.stringify(lifecycle.mock.calls);
    expect(logged).toContain("canonical_handoff");
    expect(lifecycle.mock.calls.map((call) => JSON.parse(String(call[1])))).toContainEqual(expect.objectContaining({
      event: "canonical_handoff",
      canonicalBypass: false,
      assistantOwner: "CANONICAL_CHAT",
    }));
    expect(logged).not.toContain("Atlas");
    expect(logged).not.toContain("EUR");
    expect(logged).not.toContain(utterance);
  });
});
