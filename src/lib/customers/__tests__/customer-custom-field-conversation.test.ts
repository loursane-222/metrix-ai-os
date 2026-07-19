import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ request: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), list: vi.fn(), requestUpdate: vi.fn(), confirmUpdate: vi.fn(), requestDeprecate: vi.fn(), confirmDeprecate: vi.fn(), cancelChange: vi.fn(), plan: vi.fn() }));
vi.mock("../customers-client", () => ({ requestCustomFieldCreate: api.request, confirmCustomFieldCreate: api.confirm, cancelCustomFieldCreate: api.cancel, listCustomerFieldDefinitions: api.list, requestCustomFieldUpdate: api.requestUpdate, confirmCustomFieldUpdate: api.confirmUpdate, requestCustomFieldDeprecate: api.requestDeprecate, confirmCustomFieldDeprecate: api.confirmDeprecate, cancelCustomFieldChange: api.cancelChange, resolveCustomFieldConversationCommand: api.plan }));
import { CustomerCustomFieldConversationCoordinator } from "../customer-custom-field-conversation";
const execution = { ok: true, data: { execution: { entityRef: { entityId: "definition-1" } } } };
describe("custom field conversation approval", () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset();
    api.plan.mockResolvedValue({ ok: false, error: "planner unavailable" });
    api.request.mockResolvedValue({ ok: true, data: { approval: { approvalId: "approval-1", expiresAt: "2099-01-01T00:00:00Z" } } });
    api.confirm.mockResolvedValue(execution);
    api.list.mockResolvedValue({ ok: true, data: { fields: [
      { fieldId: "customer.custom.definition-1", key: "bayi_bolgesi", label: "Bayi Bölgesi", custom: true, valueType: "string", writable: true },
      { fieldId: "customer.custom.risk-1", key: "risk_sinifi", label: "Risk Sınıfı", custom: true, valueType: "enum", writable: true, validation: { options: ["düşük", "yüksek"] } },
    ] } });
    const approval = { ok: true, data: { approval: { approvalId: "approval-2", expiresAt: "2099-01-01T00:00:00Z" } } };
    api.requestUpdate.mockResolvedValue(approval); api.requestDeprecate.mockResolvedValue(approval); api.confirmUpdate.mockResolvedValue(execution); api.confirmDeprecate.mockResolvedValue(execution);
  });
  it("creates only after confirmation", async () => { const coordinator = new CustomerCustomFieldConversationCoordinator(); expect((await coordinator.execute("Müşterilere Bayi Bölgesi diye metin alanı ekle")).status).toBe("CLARIFICATION"); expect(api.confirm).not.toHaveBeenCalled(); expect((await coordinator.execute("Evet")).message).toBe("Bayi Bölgesi alanı oluşturuldu."); expect(coordinator.state).toMatchObject({ lifecycle: "SUCCEEDED", definitionId: "definition-1" }); });
  it("routes semantic vade collision to the built-in field", async () => { const coordinator = new CustomerCustomFieldConversationCoordinator(); expect(await coordinator.execute("Varsayılan vade diye sayı alanı ekle")).toMatchObject({ handled: true, status: "CLARIFICATION" }); expect(api.request).not.toHaveBeenCalled(); });
  it("updates only after approval", async () => { const coordinator = new CustomerCustomFieldConversationCoordinator(); await coordinator.execute("Bayi Bölgesi alanını zorunlu yap"); expect(api.requestUpdate).toHaveBeenCalledWith("definition-1", { required: true }); expect(api.confirmUpdate).not.toHaveBeenCalled(); expect((await coordinator.execute("Onaylıyorum")).message).toBe("Bayi Bölgesi alanı güncellendi."); });
  it("maps delete language to deprecation", async () => { const coordinator = new CustomerCustomFieldConversationCoordinator(); expect((await coordinator.execute("Bayi Bölgesi alanını sil")).message).toContain("mevcut değerler korunacak"); expect(api.requestDeprecate).toHaveBeenCalledWith("definition-1"); expect((await coordinator.execute("Evet")).message).toBe("Bayi Bölgesi alanı kaldırıldı."); });
  it("preserves enum options", async () => { const coordinator = new CustomerCustomFieldConversationCoordinator(); await coordinator.execute("Risk Sınıfı seçeneklerine kritik ekle"); expect(api.requestUpdate).toHaveBeenCalledWith("risk-1", { options: ["düşük", "yüksek", "kritik"] }); });
});
