import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerCreateConversationCoordinator } from "../customer-create-conversation-coordinator";
import { extractObviousCustomerCreatePlan } from "../customer-create-conversation-planner";
import { CustomerCreateSurfaceRuntime } from "../customer-create-surface-runtime";
import { registerCustomerCreateSurface, resetCustomerCreateSurfaceForTests, unregisterCustomerCreateSurface } from "../customer-create-surface-command-channel";
import { registerCustomerNavigationHandler, resetCustomerNavigationHandlerForTests } from "../customer-navigation-runtime";
import { handoffHandledExtensionVoice } from "@/components/metrix-tab/voice/handledExtensionVoiceHandoff";

const acceptance = "Yeni müşteri oluştur. Firma adı Arda Yapı olsun. Telefonu 0532 111 22 33 yap. E-posta adresi test@ardayapi.com olsun. Kaydet.";
function harness(autoMount = true) {
  const executeCreate = vi.fn().mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.create", executionId: "exec-1", status: "SUCCESS", outcome: "SUCCEEDED", correlationId: "corr-1", operationId: "op-1", entityRef: { entityType: "customer", entityId: "real-customer-id" } } } });
  const runtime = new CustomerCreateSurfaceRuntime({ executeCreate, generateId: () => "idem-1" });
  let token: string | null = null; const createNavigations = vi.fn(() => { if (autoMount && !token) { runtime.mount(); token = registerCustomerCreateSurface(runtime); } return true; });
  const detailNavigations = vi.fn(); const unregisterNavigation = registerCustomerNavigationHandler(detailNavigations);
  const coordinator = new CustomerCreateConversationCoordinator({ planner: async (utterance, context) => extractObviousCustomerCreatePlan(utterance, context), navigate: createNavigations });
  return { coordinator, runtime, executeCreate, createNavigations, detailNavigations, cleanup() { coordinator.dispose(); if (token) unregisterCustomerCreateSurface(token); runtime.dispose(); unregisterNavigation(); } };
}
describe("customer create conversation acceptance", () => {
  beforeEach(() => { resetCustomerCreateSurfaceForTests(); resetCustomerNavigationHandlerForTests(); });
  afterEach(() => { resetCustomerCreateSurfaceForTests(); resetCustomerNavigationHandlerForTests(); });
  it("replays the exact live partial planner payload once and never executes", async () => {
    const executeCreate = vi.fn(); const runtime = new CustomerCreateSurfaceRuntime({ executeCreate, generateId: () => "idem" }); let token = "";
    const navigate = vi.fn(() => { runtime.mount(); token = registerCustomerCreateSurface(runtime); return true; });
    const planner = vi.fn().mockResolvedValue({ kind: "CREATE_PLAN", intent: "OPEN", fields: { displayName: "Arda Yapı", phone: "0542 280 91 77", "primaryContact.fullName": "Murat Arda" }, explicitCommit: false, unsupportedFields: [] });
    const coordinator = new CustomerCreateConversationCoordinator({ planner, navigate });
    const result = await coordinator.execute("METRIX yeni müşteri kaydı aç. Firma ismi Arda Yapı olacak. Yetkilisi Murat Arda. Telefonu 0542 280 91 77.");
    expect(result).toMatchObject({ handled: true, status: "EXECUTED" }); expect(result.message).toContain("Yetkili kişi"); expect(result.message).not.toContain("Firma adını söyle");
    expect(coordinator.store.get()).toMatchObject({ fields: { displayName: "Arda Yapı", phone: "0542 280 91 77" }, pendingReplay: false });
    expect(runtime.getState().draft).toMatchObject({ displayName: "Arda Yapı", phone: "0542 280 91 77", primaryContact: { fullName: "Murat Arda" } }); expect(navigate).toHaveBeenCalledTimes(1); expect(executeCreate).not.toHaveBeenCalled();
    const speak = vi.fn(); handoffHandledExtensionVoice({ source: "voice", message: result.message, duplicate: false, nativeRealtime: false, suppressNativeAssistant: vi.fn(), speakDeterministicResponse: speak }); expect(speak).toHaveBeenCalledOnce(); expect(speak).toHaveBeenCalledWith(result.message);
    coordinator.dispose(); unregisterCustomerCreateSurface(token); runtime.dispose();
  });
  it("creates the exact full-authority customer record without dropping registry fields", async () => {
    const h = harness(); const utterance = "Yeni müşteri oluştur. Firma adı Arda Yapı. Yetkilisi Murat Arda. Yetkili unvanı Genel Müdür. Telefonu 0542 280 91 77. Vergi numarası 1234567890. Vergi dairesi Kadıköy. Para birimi TRY. Vadesi 30 gün. Fatura adresi İstanbul Kadıköy. Kaydet.";
    const result = await h.coordinator.execute(utterance); expect(result).toMatchObject({ status: "EXECUTED", message: "Arda Yapı kaydedildi." }); expect(h.executeCreate).toHaveBeenCalledOnce();
    expect(h.executeCreate.mock.calls[0]![0]).toMatchObject({ displayName: "Arda Yapı", phone: "0542 280 91 77", taxNumber: "1234567890", taxOffice: "Kadıköy", currency: "TRY", primaryContact: { fullName: "Murat Arda", title: "Genel Müdür" }, commercialTerms: { paymentTermDays: 30 }, billingAddress: { line1: "İstanbul Kadıköy" } });
    expect(h.detailNavigations).toHaveBeenCalledWith("/metrix/customers/real-customer-id"); h.cleanup();
  });
  it.each(["Arda Yapı.", "Firma adı Arda Yapı."])("applies contextual missing displayName from production-shaped plan: %s", async (utterance) => {
    const h = harness(); await h.coordinator.execute("Yeni müşteri oluştur."); const result = await h.coordinator.execute(utterance);
    expect(result.message).not.toContain("firma adı gerekli"); expect(h.runtime.getState().draft.displayName).toBe("Arda Yapı"); expect(h.executeCreate).not.toHaveBeenCalled(); h.cleanup();
  });
  it("completes the required four-turn bare-value sequence with one execution and navigation", async () => {
    const h = harness();
    await h.coordinator.execute("Yeni müşteri oluştur.");
    await h.coordinator.execute("Arda Yapı.");
    await h.coordinator.execute("Telefonu 0542 280 91 77 yap.");
    const result = await h.coordinator.execute("Kaydet.");
    expect(result).toMatchObject({ status: "EXECUTED", message: "Arda Yapı kaydedildi." });
    expect(h.executeCreate).toHaveBeenCalledTimes(1); expect(h.executeCreate.mock.calls[0]![0]).toMatchObject({ displayName: "Arda Yapı", phone: "0542 280 91 77" });
    expect(h.detailNavigations).toHaveBeenCalledTimes(1); expect(h.createNavigations).toHaveBeenCalledTimes(1);
    const speak = vi.fn(); handoffHandledExtensionVoice({ source: "voice", message: result.message, duplicate: false, nativeRealtime: true, suppressNativeAssistant: vi.fn(), speakDeterministicResponse: speak }); expect(speak).toHaveBeenCalledOnce(); h.cleanup();
  });
  it("opens the production regression utterance, defers commit, and gives guidance only once", async () => {
    const h = harness();
    const opened = await h.coordinator.execute("Yeni müşteri kaydet.");
    expect(opened).toMatchObject({ handled: true, status: "EXECUTED" });
    expect(opened.message).toContain("Firma adını söylemen yeterli");
    expect(opened.message).not.toBe("Müşteriyi kaydetmek için firma adı gerekli.");
    expect(h.createNavigations).toHaveBeenCalledOnce(); expect(h.executeCreate).not.toHaveBeenCalled();
    const continued = await h.coordinator.execute("Atlas Yapı.");
    expect(continued.message).not.toContain("Firma adını söylemen yeterli");
    expect(h.coordinator.store.get()).toMatchObject({ lifecycle: "READY", guidanceShown: true, guidanceTurnCount: 1 });
    h.cleanup();
  });
  it("does not replay fields a second time on a surface effect remount", async () => {
    const execute = vi.fn().mockResolvedValue({ status: "EXECUTED" }); const runtime = { getState: () => ({ mounted: true }), execute }; let firstToken = "";
    const coordinator = new CustomerCreateConversationCoordinator({ planner: async () => ({ kind: "CREATE_PLAN", intent: "OPEN", fields: { displayName: "Arda Yapı", phone: "0542 280 91 77" }, explicitCommit: false, unsupportedFields: [] }), navigate: () => { firstToken = registerCustomerCreateSurface(runtime as never); return true; } });
    await coordinator.execute("Yeni müşteri oluştur."); expect(execute).toHaveBeenCalledTimes(2);
    unregisterCustomerCreateSurface(firstToken); const remountToken = registerCustomerCreateSurface(runtime as never); await Promise.resolve(); await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(2); coordinator.dispose(); unregisterCustomerCreateSurface(remountToken);
  });
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
    const before = await h.coordinator.execute("kaydettin mi?"); expect(before.message).toContain("Henüz kaydetmedim"); expect(before.message).toContain("0532 111 22 33");
    await expect(h.coordinator.execute("yukarıda verdiğim bilgilerle kaydı başlat")).resolves.toMatchObject({ message: "arda yapı kaydedildi." });
    await expect(h.coordinator.execute("işlem bitti mi?")).resolves.toMatchObject({ message: "Evet, arda yapı kaydedildi." });
    expect(h.executeCreate).toHaveBeenCalledTimes(1); expect(h.executeCreate.mock.calls[0]![0]).toMatchObject({ displayName: "arda yapı", phone: "0532 111 22 33", email: "test@ardayapi.com" }); h.cleanup();
  });
  it("stores handoff without commit, cancels without mutation, and never claims success", async () => {
    const h = harness(); const result = await h.coordinator.execute("Yeni müşteri oluştur. Firma adı Arda Yapı olsun.");
    expect(result.message).toContain("Henüz kaydetmedim"); expect(h.executeCreate).not.toHaveBeenCalled();
    await expect(h.coordinator.execute("vazgeç")).resolves.toMatchObject({ message: "Müşteri oluşturma işlemini iptal ettim." }); expect(h.executeCreate).not.toHaveBeenCalled(); h.cleanup();
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
    const coordinator = new CustomerCreateConversationCoordinator({ planner: async (utterance, context) => extractObviousCustomerCreatePlan(utterance, context), navigate: () => false });
    const cases = [
      ["IDLE", "Aktif bir müşteri oluşturma işlemi yok."], ["OPENING", "Henüz kaydetmedim"], ["COLLECTING", "Henüz kaydetmedim"], ["READY", "Henüz kaydetmedim"],
      ["SUBMITTING", "kaydı oluşturuluyor"], ["SUCCEEDED", "kaydedildi"], ["FAILED", "kaydedilemedi"], ["CANCELLED", "iptal edildi"],
    ] as const;
    for (const [lifecycle, expected] of cases) { coordinator.store.patch({ lifecycle, fields: { displayName: "Arda Yapı" }, createdCustomerDisplayName: lifecycle === "SUCCEEDED" ? "Arda Yapı" : null, lastError: lifecycle === "FAILED" ? "Guvenli hata" : null }); expect((await coordinator.execute("işlem bitti mi?")).message).toContain(expected); }
    coordinator.dispose();
  });
});
