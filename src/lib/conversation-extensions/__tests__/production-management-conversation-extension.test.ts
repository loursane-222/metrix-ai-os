import { afterEach, describe, expect, it, vi } from "vitest";
import { productionManagementConversationExtension } from "../production-management-conversation-extension";

const productionOrder = { id: "po1", orderNumber: "UE-1001", status: "DRAFT" as const, sourceOrderId: null, productServiceId: null, workCenterId: null, quantityPlanned: "100", quantityProduced: "0", plannedStartAt: null, plannedEndAt: null, actualStartAt: null, actualEndAt: null, notes: null, updatedAt: "2026-01-01T00:00:00.000Z" };

describe("productionManagementConversationExtension", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens list and create surfaces", async () => {
    await expect(productionManagementConversationExtension.execute("üretim emirlerini göster")).resolves.toMatchObject({ status: "HANDOFF", handoff: { outcomeCode: "PRODUCTION_LIST_OPENED" } });
    await expect(productionManagementConversationExtension.execute("yeni üretim emri oluştur")).resolves.toMatchObject({ status: "HANDOFF", handoff: { outcomeCode: "PRODUCTION_CREATE_OPENED" } });
  });

  it("accepts the undiacritic speech-transcription variant", async () => {
    await expect(productionManagementConversationExtension.execute("uretim emirlerini listele")).resolves.toMatchObject({ status: "HANDOFF", handoff: { outcomeCode: "PRODUCTION_LIST_OPENED" } });
  });

  it("resolves a production order by number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true, data: { productions: [productionOrder], count: 1 } }) }));
    await expect(productionManagementConversationExtension.execute("UE-1001 üretim emrini aç")).resolves.toMatchObject({ status: "HANDOFF", handoff: { outcomeCode: "PRODUCTION_ORDER_OPENED", entityResolution: "RESOLVED" } });
  });

  it("reports not found without navigation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true, data: { productions: [productionOrder], count: 1 } }) }));
    await expect(productionManagementConversationExtension.execute("UE-9999 üretim emrini aç")).resolves.toMatchObject({ status: "HANDOFF", handoff: { outcomeCode: "PRODUCTION_NOT_FOUND", entityResolution: "NOT_FOUND", navigationRequested: false } });
  });

  it("does not handle unrelated utterances", async () => {
    await expect(productionManagementConversationExtension.execute("bugün hava nasıl")).resolves.toEqual({ status: "NOT_HANDLED", handoff: null });
  });
});
