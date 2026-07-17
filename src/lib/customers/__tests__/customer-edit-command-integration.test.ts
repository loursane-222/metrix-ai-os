import { afterEach, describe, expect, it, vi } from "vitest";

const { resolveCustomerEditCommandMock } = vi.hoisted(() => ({
  resolveCustomerEditCommandMock: vi.fn(),
}));

vi.mock("../customers-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../customers-client")>();
  return { ...actual, resolveCustomerEditCommand: resolveCustomerEditCommandMock };
});

import {
  describeCustomerEditCommandExecutionResult,
  resolveAndDispatchCustomerEditSurfaceCommand,
} from "../customer-edit-command-integration";
import {
  registerCustomerEditSurfaceTarget,
  resetCustomerEditSurfaceCommandChannelForTests,
} from "../customer-edit-surface-command-channel";
import type { CustomerEditSurfaceState } from "../customer-edit-surface-runtime";

function fakeRuntime(overrides: Partial<CustomerEditSurfaceState> = {}) {
  const state: CustomerEditSurfaceState = {
    loading: false,
    loadError: null,
    customer: null,
    draftId: "draft_1",
    draftSnapshot: null,
    activeTab: "identity",
    saving: false,
    saveError: null,
    blockingMessage: null,
    savedAt: null,
    ...overrides,
  };
  return {
    getState: vi.fn(() => state),
    executeSurfaceAction: vi.fn(async () => undefined),
  };
}

describe("resolveAndDispatchCustomerEditSurfaceCommand", () => {
  afterEach(() => {
    resetCustomerEditSurfaceCommandChannelForTests();
    resolveCustomerEditCommandMock.mockReset();
  });

  it("returns null and never calls the network when no Customer Edit surface is mounted", async () => {
    const result = await resolveAndDispatchCustomerEditSurfaceCommand("Telefonu degistir.");
    expect(result).toBeNull();
    expect(resolveCustomerEditCommandMock).not.toHaveBeenCalled();
  });

  it("dispatches an executable command to the mounted runtime when a surface is active", async () => {
    const runtime = fakeRuntime({ draftSnapshot: { draftId: "draft_1", entityType: "customer", entityId: "cust_1", baseVersion: 1, fieldValues: { phone: "111" }, dirtyFields: [], valid: true, createdAt: "", updatedAt: "" } });
    registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime });
    resolveCustomerEditCommandMock.mockResolvedValue({
      ok: true,
      data: {
        outcome: {
          kind: "resolved",
          resolution: {
            kind: "executable",
            command: { type: "set_field", field: { kind: "top", field: "phone" }, value: "222" },
          },
        },
      },
    });

    const result = await resolveAndDispatchCustomerEditSurfaceCommand("Telefonu 222 yap.");

    expect(resolveCustomerEditCommandMock).toHaveBeenCalledWith("cust_1", { utterance: "Telefonu 222 yap.", activeTab: "identity" });
    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } });
    expect(result).toMatchObject({ status: "EXECUTED" });
  });

  it("maps an unsupported resolution to status UNSUPPORTED without dispatching", async () => {
    const runtime = fakeRuntime();
    registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime });
    resolveCustomerEditCommandMock.mockResolvedValue({
      ok: true,
      data: { outcome: { kind: "resolved", resolution: { kind: "unsupported" } } },
    });

    const result = await resolveAndDispatchCustomerEditSurfaceCommand("Bugün hava nasıl?");

    expect(result).toEqual({ status: "UNSUPPORTED" });
    expect(runtime.executeSurfaceAction).not.toHaveBeenCalled();
  });

  it("maps a clarification_required resolution through without dispatching", async () => {
    const runtime = fakeRuntime();
    registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime });
    resolveCustomerEditCommandMock.mockResolvedValue({
      ok: true,
      data: { outcome: { kind: "resolved", resolution: { kind: "clarification_required", message: "Hangi alani?" } } },
    });

    const result = await resolveAndDispatchCustomerEditSurfaceCommand("Bir şeyi değiştir.");

    expect(result).toEqual({ status: "CLARIFICATION_REQUIRED", message: "Hangi alani?" });
    expect(runtime.executeSurfaceAction).not.toHaveBeenCalled();
  });

  it("treats invalid_output as VALIDATION_FAILED", async () => {
    registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime: fakeRuntime() });
    resolveCustomerEditCommandMock.mockResolvedValue({ ok: true, data: { outcome: { kind: "invalid_output" } } });

    const result = await resolveAndDispatchCustomerEditSurfaceCommand("???");

    expect(result).toEqual({ status: "VALIDATION_FAILED", reason: "Model ciktisi dogrulanamadi." });
  });

  it("re-validates the server payload at the client boundary and rejects a shape that does not pass validation, even though it crossed the network as ok:true", async () => {
    registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime: fakeRuntime() });
    resolveCustomerEditCommandMock.mockResolvedValue({
      ok: true,
      data: { outcome: { kind: "resolved", resolution: { kind: "executable", command: { type: "not_a_real_command" } } } },
    });

    const result = await resolveAndDispatchCustomerEditSurfaceCommand("Telefonu degistir.");

    expect(result).toEqual({ status: "VALIDATION_FAILED", reason: "Sunucu yaniti beklenen semaya uymuyor." });
  });

  it("maps a network failure to EXECUTION_FAILED", async () => {
    registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime: fakeRuntime() });
    resolveCustomerEditCommandMock.mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });

    const result = await resolveAndDispatchCustomerEditSurfaceCommand("Telefonu degistir.");

    expect(result).toEqual({ status: "EXECUTION_FAILED", error: "Baglanti kurulamadi." });
  });

  it("performs exactly one resolve + one dispatch per call — written and voice paths share this same function, so no duplicate execution occurs for one utterance", async () => {
    const runtime = fakeRuntime();
    registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime });
    resolveCustomerEditCommandMock.mockResolvedValue({
      ok: true,
      data: { outcome: { kind: "resolved", resolution: { kind: "executable", command: { type: "commit" } } } },
    });

    await resolveAndDispatchCustomerEditSurfaceCommand("Kaydet.");

    expect(resolveCustomerEditCommandMock).toHaveBeenCalledTimes(1);
    expect(runtime.executeSurfaceAction).toHaveBeenCalledTimes(1);
  });
});

describe("describeCustomerEditCommandExecutionResult", () => {
  it("describes a successful commit", () => {
    expect(
      describeCustomerEditCommandExecutionResult({ status: "EXECUTED", command: { type: "commit" }, commitOutcome: "SAVED" }),
    ).toBe("Degisiklikler kaydedildi.");
  });

  it("describes clarification_required with the model's own message", () => {
    expect(describeCustomerEditCommandExecutionResult({ status: "CLARIFICATION_REQUIRED", message: "Hangi alani?" })).toBe(
      "Hangi alani?",
    );
  });

  it("returns null for UNSUPPORTED so normal chat flow stays silent about it", () => {
    expect(describeCustomerEditCommandExecutionResult({ status: "UNSUPPORTED" })).toBeNull();
  });
});
