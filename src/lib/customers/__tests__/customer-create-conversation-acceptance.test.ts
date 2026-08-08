import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerCreateConversationCoordinator } from "../customer-create-conversation-coordinator";
import { extractObviousCustomerCreatePlan } from "../customer-create-conversation-planner";
import { CustomerCreateSurfaceRuntime } from "../customer-create-surface-runtime";
import { registerCustomerCreateSurface, resetCustomerCreateSurfaceForTests, unregisterCustomerCreateSurface } from "../customer-create-surface-command-channel";
import { registerCustomerNavigationHandler, resetCustomerNavigationHandlerForTests } from "../customer-navigation-runtime";
import { resetConversationNavigationHandlerForTests } from "@/lib/conversation-extensions/conversation-navigation-runtime";

const productionRegression = "Atlas artık euro ile çalışıyor. Önümüzdeki hafta da yeni fiyat teklifi istemeleri muhtemel.";

function harness(autoMount = true) {
  const executeCreate = vi.fn().mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.create", executionId: "exec-1", status: "SUCCESS", outcome: "SUCCEEDED", correlationId: "corr-1", operationId: "op-1", entityRef: { entityType: "customer", entityId: "customer-id" } } } });
  const runtime = new CustomerCreateSurfaceRuntime({ executeCreate, generateId: () => "idem-1" });
  let token: string | null = null;
  const navigate = vi.fn(() => { if (autoMount && !token) { runtime.mount(); token = registerCustomerCreateSurface(runtime); } return true; });
  const detailNavigation = vi.fn();
  const unregisterNavigation = registerCustomerNavigationHandler(detailNavigation);
  const coordinator = new CustomerCreateConversationCoordinator({ planner: async (utterance, context) => extractObviousCustomerCreatePlan(utterance, context), navigate });
  return { coordinator, runtime, executeCreate, navigate, detailNavigation, cleanup() { coordinator.dispose(); if (token) unregisterCustomerCreateSurface(token); runtime.dispose(); unregisterNavigation(); } };
}

describe("customer create conversation authority acceptance", () => {
  beforeEach(() => { resetCustomerCreateSurfaceForTests(); resetCustomerNavigationHandlerForTests(); resetConversationNavigationHandlerForTests(); });
  afterEach(() => { resetCustomerCreateSurfaceForTests(); resetCustomerNavigationHandlerForTests(); resetConversationNavigationHandlerForTests(); });

  it("extracts the exact production enrichment without create ownership or probable mutation", async () => {
    const h = harness();
    expect(extractObviousCustomerCreatePlan(productionRegression)).toMatchObject({ kind: "CREATE_PLAN", operation: "ENRICH", entityReference: "Atlas", fields: { currency: "EUR" }, semantic: { stage: "PROVIDE_FIELDS", probableClauseCount: 1 } });
    const result = await h.coordinator.execute(productionRegression);
    expect(result).toMatchObject({ handled: true, status: "OBSERVED", operation: "ENRICH", outcomeCode: "CANONICAL_CUSTOMER_EVIDENCE", fieldNames: ["currency"], hasEntityReference: true, probableClauseCount: 1, navigationRequested: false, mutationPerformed: false });
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.executeCreate).not.toHaveBeenCalled();
    expect(h.coordinator.store.get().lifecycle).toBe("IDLE");
    h.cleanup();
  });

  it("extracts single and multi-field enrichment without opening create", async () => {
    const h = harness();
    expect(extractObviousCustomerCreatePlan("Atlas artık euro ile çalışıyor.")).toMatchObject({ operation: "ENRICH", entityReference: "Atlas", fields: { currency: "EUR" } });
    const result = await h.coordinator.execute("Atlas artık euro ile çalışıyor, ödeme vadesi de 45 gün oldu.");
    expect(result).toMatchObject({ operation: "ENRICH", fieldNames: expect.arrayContaining(["currency", "commercialTerms.paymentTermDays"]), navigationRequested: false });
    expect(h.navigate).not.toHaveBeenCalled();
    h.cleanup();
  });

  it("opens a real create draft but does not commit without explicit intent", async () => {
    const h = harness();
    const result = await h.coordinator.execute("Yeni müşteri oluştur. Firma adı Arda Yapı.");
    expect(result).toMatchObject({ operation: "CREATE", outcomeCode: "CREATE_DRAFT_READY", mutationPerformed: false });
    expect(h.navigate).toHaveBeenCalledOnce();
    expect(h.runtime.getState().draft.displayName).toBe("Arda Yapı");
    expect(h.executeCreate).not.toHaveBeenCalled();
    h.cleanup();
  });

  it("does not mutate for the Product Experience open-and-project acceptance utterance", async () => {
    const h = harness();
    const result = await h.coordinator.execute("Yeni müşteri kaydı aç. Firma adı Experience Runtime Test, telefon 0555 111 22 33.");
    expect(result).toMatchObject({ operation: "CREATE", outcomeCode: "CREATE_DRAFT_READY", mutationPerformed: false });
    expect(h.runtime.getState().draft).toMatchObject({ displayName: "Experience Runtime Test", phone: "0555 111 22 33" });
    expect(h.executeCreate).not.toHaveBeenCalled();
    h.cleanup();
  });

  it("targets the create surface authority with one typed acceptance field batch", async () => {
    const runtime = new CustomerCreateSurfaceRuntime();
    runtime.mount();
    const token = registerCustomerCreateSurface(runtime);
    const deliver = vi.fn().mockResolvedValue({ status: "COMPLETED", changedExecutiveTargetIds: [] });
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => ({ kind: "CREATE_PLAN", intent: "OPEN", explicitCommit: false, unsupportedFields: [], operation: "CREATE", fields: { displayName: "Atlas", "billingAddress.city": "İzmir", "billingAddress.district": "Bornova", "primaryContact.fullName": "Belgin Arda" } }),
      navigate: () => false,
      deliver,
    });
    await coordinator.execute("Yeni müşteri kaydı aç. Firma ismi Atlas, İzmir-Bornova, yetkilisi Belgin Arda.");
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({
      expectedSurfaceAuthorityKey: "customers.customer.create",
      batch: expect.arrayContaining([
        expect.objectContaining({ executiveTargetId: expect.stringContaining("customer.displayName"), value: "Atlas" }),
        expect.objectContaining({ executiveTargetId: expect.stringContaining("customer.billingAddress.city"), value: "İzmir" }),
        expect.objectContaining({ executiveTargetId: expect.stringContaining("customer.billingAddress.district"), value: "Bornova" }),
        expect.objectContaining({ executiveTargetId: expect.stringContaining("customer.primaryContact.fullName"), value: "Belgin Arda" }),
      ]),
    }), false);
    unregisterCustomerCreateSurface(token);
    runtime.dispose();
  });

  it("commits explicit create once through the existing action policy", async () => {
    const h = harness();
    const result = await h.coordinator.execute("Yeni müşteri oluştur. Firma adı Arda Yapı. Kaydet.");
    expect(result).toMatchObject({ operation: "CREATE", outcomeCode: "CREATE_COMMITTED", mutationPerformed: true });
    expect(h.executeCreate).toHaveBeenCalledOnce();
    expect(h.detailNavigation).toHaveBeenCalledOnce();
    h.cleanup();
  });

  it("captures a free-text notification target and carries it into the create action", async () => {
    const h = harness();
    const result = await h.coordinator.execute("Yeni müşteri oluştur. Firma adı Arda Yapı ve bunu Ahmet'e de bildir. Kaydet.");
    expect(result).toMatchObject({ operation: "CREATE", outcomeCode: "CREATE_COMMITTED", mutationPerformed: true });
    expect(h.executeCreate).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Arda Yapı", additionalNotificationTargets: ["Ahmet'e"] }), "idem-1", undefined);
    h.cleanup();
  });

  it("keeps existing-customer update away from customer-create authority", async () => {
    const h = harness();
    const result = await h.coordinator.execute("Atlas’ın ödeme vadesini 45 gün yap.");
    expect(result).toMatchObject({
      operation: "UPDATE",
      fieldNames: ["commercialTerms.paymentTermDays"],
      hasEntityReference: true,
      outcomeCode: "CANONICAL_CUSTOMER_EVIDENCE",
    });
    expect(result.navigationRequested).toBe(false);
    expect(result.mutationPerformed).toBe(false);
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.executeCreate).not.toHaveBeenCalled();
    expect(h.coordinator.store.get().lifecycle).toBe("IDLE");
    h.cleanup();
  });

  it("turns create navigation failure into evidence and clears phantom workflow ownership", async () => {
    const deliver = vi.fn().mockResolvedValue({ status: "EXPIRED", changedExecutiveTargetIds: [] });
    const coordinator = new CustomerCreateConversationCoordinator({ planner: async (utterance, context) => extractObviousCustomerCreatePlan(utterance, context), navigate: () => false, deliver });
    const failed = await coordinator.execute("Yeni müşteri oluştur.");
    expect(failed).toMatchObject({ status: "FAILED", operation: "CREATE", outcomeCode: "CREATE_NAVIGATION_FAILED", failureCode: "NAVIGATION_EXPIRED", navigationRequested: true });
    expect(coordinator.store.get().lifecycle).toBe("IDLE");
    const next = await coordinator.execute(productionRegression);
    expect(next).toMatchObject({ operation: "ENRICH", navigationRequested: false });
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("preserves the known displayName across an entity-ambiguity clarification and continues the draft when the user picks a new record (production regression)", async () => {
    const h = harness();
    let call = 0;
    const planner = async (utterance: string, context: Parameters<typeof extractObviousCustomerCreatePlan>[1]) => {
      call += 1;
      if (call === 1) return { kind: "CLARIFICATION_REQUIRED" as const, reason: "Firma adı eklendi.", entityAmbiguous: true, candidateNames: ["Atlas 9d8fbf4", "ACCEPTANCE Atlas 9d8fbf4"], fields: { displayName: "Atlas" } };
      return extractObviousCustomerCreatePlan(utterance, context);
    };
    const coordinator = new CustomerCreateConversationCoordinator({ planner, navigate: h.navigate, deliver: undefined });
    const ambiguous = await coordinator.execute("Atlas müşterisini oluştur.");
    expect(ambiguous).toMatchObject({ status: "CLARIFICATION", operation: "CREATE", outcomeCode: "CREATE_ENTITY_AMBIGUOUS", entityAmbiguous: true, candidateNames: ["Atlas 9d8fbf4", "ACCEPTANCE Atlas 9d8fbf4"] });
    expect(coordinator.store.get()).toMatchObject({ lifecycle: "COLLECTING", fields: { displayName: "Atlas" }, missingFields: [] });
    const opened = await coordinator.execute("Yeni bir müşteri kaydı açalım.");
    expect(opened).toMatchObject({ operation: "CREATE", outcomeCode: "CREATE_DRAFT_READY" });
    expect(h.runtime.getState().draft.displayName).toBe("Atlas");
    const reaffirmed = await coordinator.execute("Firma adı Atlas olsun.");
    expect(reaffirmed).toMatchObject({ operation: "CREATE", outcomeCode: "CREATE_DRAFT_READY" });
    expect(h.runtime.getState().draft.displayName).toBe("Atlas");
    coordinator.dispose();
    h.cleanup();
  });

  it("does not create workflow state for unrelated conversation", async () => {
    const h = harness();
    await expect(h.coordinator.execute("Bugün nasılsın?")).resolves.toMatchObject({ handled: false, status: "NOT_HANDLED", operation: "UNKNOWN" });
    expect(h.coordinator.store.get().lifecycle).toBe("IDLE");
    expect(h.navigate).not.toHaveBeenCalled();
    h.cleanup();
  });
});
