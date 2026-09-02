import { afterEach, describe, expect, it, vi } from "vitest";
import { customerAttachmentConversationCoordinator } from "@/lib/customers/customer-attachment-conversation-coordinator";
import { customerCustomFieldConversationCoordinator } from "@/lib/customers/customer-custom-field-conversation";
import { customerManagementConversationExtension } from "../customer-management-conversation-extension";
import { customerCreateConversationCoordinator } from "@/lib/customers/customer-create-conversation-coordinator";
import { registerCustomerNavigationHandler, resetCustomerNavigationHandlerForTests } from "@/lib/customers/customer-navigation-runtime";
import * as customersClient from "@/lib/customers/customers-client";

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

  // Production regression (METRIX_WORKSPACE_CANONICAL_OPERATION_HANDOFF.md
  // §0/§4): once a customer-create operation is already pending, a short,
  // context-dependent continuation turn ("evet var", "tamamla") must still
  // reach the coordinator (and its real LLM planner) even though the local,
  // zero-network gate has no vocabulary for it — the gate must never have
  // veto power over an already-active operation. Before this fix, the
  // coordinator was simply never called for such turns, so no pending
  // operation state existed and free-text AI fabricated "kaydettim" success
  // narration with zero real mutation.
  it("invokes the coordinator for a pending-operation continuation turn the local gate doesn't recognize (production regression)", async () => {
    vi.spyOn(customerAttachmentConversationCoordinator, "execute").mockResolvedValue({ handled: false, outcome: "NOT_ATTACHMENT_INTENT", message: null });
    vi.spyOn(customerCustomFieldConversationCoordinator, "execute").mockResolvedValue({ handled: false, status: "EXECUTED", message: null });
    customerCreateConversationCoordinator.store.patch({ lifecycle: "COLLECTING", fields: { displayName: "Selvi Mermer" }, missingFields: [], operationId: "op-continuation-test" });
    const create = vi.spyOn(customerCreateConversationCoordinator, "execute").mockResolvedValue({
      handled: true, status: "EXECUTED", operation: "CREATE", outcomeCode: "CREATE_COMMITTED",
      fieldNames: ["displayName"], hasEntityReference: false, entityAmbiguous: false, candidateNames: [],
      probableClauseCount: 0, mutationPerformed: true, navigationRequested: false, navigationStatus: "COMPLETED",
      failureCode: null, approvalRequired: false, operationId: "op-continuation-test",
    });

    try {
      await customerManagementConversationExtension.execute("evet var", "written", "turn-continuation");
      expect(create).toHaveBeenCalledWith("evet var", "written", expect.any(String));
    } finally {
      customerCreateConversationCoordinator.store.reset();
    }
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

  describe("custom-field update — Workspace-intent contract", () => {
    // The label extracted by customValueSet's regex keeps the possessive
    // suffix attached ("Öncelik'i", not "Öncelik") — matching that literally
    // here tests this suite's new reveal-gating addition, not the
    // pre-existing (unchanged) Turkish possessive-suffix matching behavior.
    const field = { fieldId: "customer.custom.def-1", key: "custom.def-1", label: "Öncelik'i", custom: true, writable: true, clearable: true } as never;

    function stubNonCustomFieldStages() {
      vi.spyOn(customerAttachmentConversationCoordinator, "execute").mockResolvedValue({ handled: false, outcome: "NOT_ATTACHMENT_INTENT", message: null });
      vi.spyOn(customerCustomFieldConversationCoordinator, "execute").mockResolvedValue({ handled: false, status: "EXECUTED", message: null });
      vi.spyOn(customerCreateConversationCoordinator, "execute").mockResolvedValue({
        handled: false, status: "NOT_HANDLED", operation: "UNKNOWN", outcomeCode: "NOT_CUSTOMER_OPERATION",
        fieldNames: [], hasEntityReference: false, entityAmbiguous: false, candidateNames: [], probableClauseCount: 0,
        mutationPerformed: false, navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null,
        approvalRequired: false, operationId: null,
      });
      vi.spyOn(customersClient, "listCustomers").mockResolvedValue({ ok: true, data: { customers: [{ id: "cust-1", displayName: "Deneme", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null }] } } as never);
      vi.spyOn(customersClient, "listCustomerFieldDefinitions").mockResolvedValue({ ok: true, data: { fields: [field] } });
      vi.spyOn(customersClient, "getCustomer").mockResolvedValue({ ok: true, data: { customer: { id: "cust-1", displayName: "Deneme", updatedAt: "2026-01-01T00:00:00.000Z" } } } as never);
      vi.spyOn(customersClient, "executeCustomerUpdateAction").mockResolvedValue({ ok: true, data: { execution: { status: "SUCCESS" } } } as never);
    }

    afterEach(() => resetCustomerNavigationHandlerForTests());

    it("completes the custom-field update without opening the customer's Workspace (background-safe by default)", async () => {
      stubNonCustomFieldStages();
      const navigate = vi.fn();
      const unregister = registerCustomerNavigationHandler(navigate);
      try {
        const result = await customerManagementConversationExtension.execute("Deneme'nin Öncelik'i Yüksek olsun.", "written", "turn-custom-field-1");
        expect(result).toMatchObject({ status: "HANDOFF", handoff: { operation: "UPDATE", resultStatus: "EXECUTED", mutationPerformed: true } });
        expect(navigate).not.toHaveBeenCalled();
      } finally {
        unregister();
      }
    });
  });
});
