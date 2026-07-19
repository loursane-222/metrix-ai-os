import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerCreateConversationCoordinator } from "../customer-create-conversation-coordinator";
import { extractObviousCustomerCreatePlan } from "../customer-create-conversation-planner";
import { CustomerCreateSurfaceRuntime } from "../customer-create-surface-runtime";
import { registerCustomerCreateSurface, resetCustomerCreateSurfaceForTests, unregisterCustomerCreateSurface } from "../customer-create-surface-command-channel";
import { registerCustomerNavigationHandler, resetCustomerNavigationHandlerForTests } from "../customer-navigation-runtime";

const acceptance = "Yeni müşteri oluştur. Firma adı Arda Yapı olsun. Telefonu 0532 111 22 33 yap. E-posta adresi test@ardayapi.com olsun. Kaydet.";
function harness(autoMount = true) {
  const executeCreate = vi.fn().mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.create", executionId: "exec-1", status: "SUCCESS", outcome: "SUCCEEDED", correlationId: "corr-1", operationId: "op-1", entityRef: { entityType: "customer", entityId: "real-customer-id" } } } });
  const runtime = new CustomerCreateSurfaceRuntime({ executeCreate, generateId: () => "idem-1" });
  let token: string | null = null; const createNavigations = vi.fn(() => { if (autoMount && !token) { runtime.mount(); token = registerCustomerCreateSurface(runtime); } return true; });
  const detailNavigations = vi.fn(); const unregisterNavigation = registerCustomerNavigationHandler(detailNavigations);
  const coordinator = new CustomerCreateConversationCoordinator({ planner: async (utterance, fields) => extractObviousCustomerCreatePlan(utterance, Object.keys(fields).length > 0), navigate: createNavigations });
  return { coordinator, runtime, executeCreate, createNavigations, detailNavigations, cleanup() { coordinator.dispose(); if (token) unregisterCustomerCreateSurface(token); runtime.dispose(); unregisterNavigation(); } };
}
describe("customer create conversation acceptance", () => {
  beforeEach(() => { resetCustomerCreateSurfaceForTests(); resetCustomerNavigationHandlerForTests(); });
  afterEach(() => { resetCustomerCreateSurfaceForTests(); resetCustomerNavigationHandlerForTests(); });
  it("passes the exact failed single-turn sequence with one real execution and authoritative status", async () => {
    const h = harness();
    await expect(h.coordinator.execute(acceptance)).resolves.toMatchObject({ handled: true, status: "EXECUTED", message: "Arda Yapı kaydedildi." });
    expect(h.createNavigations).toHaveBeenCalledTimes(1); expect(h.executeCreate).toHaveBeenCalledTimes(1);
    expect(h.executeCreate.mock.calls[0]![0]).toEqual({ displayName: "Arda Yapı", legalName: undefined, phone: "0532 111 22 33", email: "test@ardayapi.com", metrixNote: undefined });
    expect(h.detailNavigations).toHaveBeenCalledWith("/metrix/customers/real-customer-id");
    await expect(h.coordinator.execute("kaydettin mi?")).resolves.toMatchObject({ message: "Evet, Arda Yapı kaydedildi." });
    expect(h.executeCreate).toHaveBeenCalledTimes(1); h.cleanup();
  });
  it("preserves fields through the exact multi-turn continuation and commits once", async () => {
    const h = harness();
    await h.coordinator.execute("yeni müşteri oluştur");
    await h.coordinator.execute("firma adı arda yapı");
    await h.coordinator.execute("telefonu 0532 111 22 33 yap");
    await h.coordinator.execute("e-posta test@ardayapi.com olsun");
    const before = await h.coordinator.execute("kaydettin mi?"); expect(before.message).toContain("Henuz kaydetmedim"); expect(before.message).toContain("0532 111 22 33");
    await expect(h.coordinator.execute("yukarıda verdiğim bilgilerle kaydı başlat")).resolves.toMatchObject({ message: "arda yapı kaydedildi." });
    await expect(h.coordinator.execute("işlem bitti mi?")).resolves.toMatchObject({ message: "Evet, arda yapı kaydedildi." });
    expect(h.executeCreate).toHaveBeenCalledTimes(1); expect(h.executeCreate.mock.calls[0]![0]).toMatchObject({ displayName: "arda yapı", phone: "0532 111 22 33", email: "test@ardayapi.com" }); h.cleanup();
  });
  it("stores handoff without commit, cancels without mutation, and never claims success", async () => {
    const h = harness(false); const result = await h.coordinator.execute("Yeni müşteri oluştur. Firma adı Arda Yapı olsun.");
    expect(result.message).toContain("Henuz kaydetmedim"); expect(h.executeCreate).not.toHaveBeenCalled();
    await expect(h.coordinator.execute("vazgeç")).resolves.toMatchObject({ message: "Musteri olusturma islemini iptal ettim." }); expect(h.executeCreate).not.toHaveBeenCalled(); h.cleanup();
  });
  it("reports real API failure and missing execution customer id without success copy", async () => {
    const h = harness(); h.executeCreate.mockResolvedValueOnce({ ok: false, error: "Guvenli hata" });
    const failed = await h.coordinator.execute(acceptance); expect(failed.status).toBe("FAILED"); expect(failed.message).toContain("kaydedilemedi"); expect(failed.message).not.toContain("kaydedildi."); h.cleanup();
    const h2 = harness(); h2.executeCreate.mockResolvedValueOnce({ ok: true, data: { execution: { actionName: "customer.create", executionId: "e", status: "SUCCESS", outcome: "SUCCEEDED", correlationId: "c", operationId: "o" } } });
    const missingId = await h2.coordinator.execute(acceptance); expect(missingId.status).toBe("FAILED"); expect(missingId.message).not.toMatch(/\bkaydedildi\b/); h2.cleanup();
  });
  it("owns obvious create intent during planner failure but lets unrelated conversation fall through", async () => {
    const executeCreate = vi.fn().mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.create", executionId: "e", status: "SUCCESS", outcome: "SUCCEEDED", correlationId: "c", operationId: "o", entityRef: { entityType: "customer", entityId: "real" } } } });
    const runtime = new CustomerCreateSurfaceRuntime({ executeCreate, generateId: () => "idem" }); let token = "";
    const coordinator = new CustomerCreateConversationCoordinator({ planner: async () => { throw new Error("network"); }, navigate: () => { runtime.mount(); token = registerCustomerCreateSurface(runtime); return true; } });
    await expect(coordinator.execute(acceptance)).resolves.toMatchObject({ handled: true, message: "Arda Yapı kaydedildi." });
    coordinator.store.reset(); await expect(coordinator.execute("Bugun hava nasil?")).resolves.toEqual({ handled: false, status: "NOT_HANDLED", message: null });
    expect(executeCreate).toHaveBeenCalledTimes(1); coordinator.dispose(); unregisterCustomerCreateSurface(token); runtime.dispose();
  });
  it("reports every lifecycle from real state without execution claims", async () => {
    const coordinator = new CustomerCreateConversationCoordinator({ planner: async (utterance, fields) => extractObviousCustomerCreatePlan(utterance, Object.keys(fields).length > 0), navigate: () => false });
    const cases = [
      ["IDLE", "Aktif bir musteri olusturma islemi yok."], ["OPENING", "Henuz kaydetmedim"], ["COLLECTING", "Henuz kaydetmedim"], ["READY", "Henuz kaydetmedim"],
      ["SUBMITTING", "kaydi olusturuluyor"], ["SUCCEEDED", "kaydedildi"], ["FAILED", "kaydedilemedi"], ["CANCELLED", "iptal edildi"],
    ] as const;
    for (const [lifecycle, expected] of cases) { coordinator.store.patch({ lifecycle, fields: { displayName: "Arda Yapı" }, createdCustomerDisplayName: lifecycle === "SUCCEEDED" ? "Arda Yapı" : null, lastError: lifecycle === "FAILED" ? "Guvenli hata" : null }); expect((await coordinator.execute("işlem bitti mi?")).message).toContain(expected); }
    coordinator.dispose();
  });
});
