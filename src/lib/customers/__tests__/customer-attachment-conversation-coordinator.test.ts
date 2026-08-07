import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../customers-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../customers-client")>();
  return {
    ...actual,
    listCustomerFieldDefinitions: vi.fn().mockResolvedValue({ ok: true, data: { fields: [] } }),
  };
});

import { customerAttachmentConversationCoordinator } from "../customer-attachment-conversation-coordinator";
import {
  registerCustomerCreateSurface,
  resetCustomerCreateSurfaceForTests,
} from "../customer-create-surface-command-channel";

const storage = new Map<string, string>();

describe("customer attachment conversation resume", () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: true, data: { draftId: "draft-1" } }),
    }));
    resetCustomerCreateSurfaceForTests();
  });

  afterEach(() => {
    customerAttachmentConversationCoordinator.reset();
    resetCustomerCreateSurfaceForTests();
    vi.unstubAllGlobals();
  });

  it("replays a persisted reviewed preview after a full-page form navigation", async () => {
    sessionStorage.setItem("metrix-customer-attachment-conversation-v1", JSON.stringify({
      attachment: {
        attachmentRef: "attachment-1",
        filename: "tax.png",
        mimeType: "image/png",
        size: 100,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      preview: {
        lifecycle: "REVIEW_REQUIRED",
        attachment: {
          attachmentRef: "attachment-1",
          filename: "tax.png",
          mimeType: "image/png",
          size: 100,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        extractionRequestId: "extraction-1",
        candidates: [{
          fieldId: "customer.legalName",
          extractedValue: "Kanıt Ltd.",
          normalizedValue: "Kanıt Ltd.",
          confidence: 0.99,
          source: { sourceId: "attachment-1", mediaType: "image/png" },
          warnings: [],
          conflicts: [],
          conflictStatus: "NONE",
          requiresUserConfirmation: true,
        }],
        duplicates: [],
        accepted: ["customer.legalName"],
        rejected: [],
        edits: {},
      },
    }));
    const execute = vi.fn().mockResolvedValue({ status: "EXECUTED" });
    registerCustomerCreateSurface({ getState: vi.fn() as never, execute });

    await expect(customerAttachmentConversationCoordinator.resumePendingDraftApplication())
      .resolves.toBe(true);
    expect(execute).toHaveBeenNthCalledWith(1, {
      type: "bind_ingestion",
      attachmentRef: "attachment-1",
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "set_field",
      field: "legalName",
      value: "Kanıt Ltd.",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/customers/document-extractions/attachment-1/candidates-applied",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(storage.values().next().value ?? "{}").preview.lifecycle).toBe("READY");
  });
});
