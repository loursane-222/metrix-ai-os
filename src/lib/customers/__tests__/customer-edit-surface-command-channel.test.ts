import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dispatchCustomerEditSurfaceCommand,
  getActiveCustomerEditSurfaceDescriptor,
  registerCustomerEditSurfaceTarget,
  resetCustomerEditSurfaceCommandChannelForTests,
  unregisterCustomerEditSurfaceTarget,
} from "../customer-edit-surface-command-channel";
import type { CustomerEditSurfaceState } from "../customer-edit-surface-runtime";

function fakeState(overrides: Partial<CustomerEditSurfaceState> = {}): CustomerEditSurfaceState {
  return {
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
}

function fakeRuntime(overrides: Partial<CustomerEditSurfaceState> = {}) {
  let state = fakeState(overrides);
  return {
    getState: vi.fn(() => state),
    executeSurfaceAction: vi.fn(async (action: { actionName: string; payload?: Record<string, unknown> }) => {
      if (action.actionName === "surface.select_tab") {
        state = { ...state, activeTab: String(action.payload?.tabId) };
      }
    }),
    setState: (next: Partial<CustomerEditSurfaceState>) => {
      state = { ...state, ...next };
    },
  };
}

describe("CustomerEditSurfaceCommandChannel", () => {
  afterEach(() => {
    resetCustomerEditSurfaceCommandChannelForTests();
  });

  it("has no active surface before anything registers", () => {
    expect(getActiveCustomerEditSurfaceDescriptor()).toBeNull();
  });

  it("register/unregister makes the target active and then inactive again", () => {
    const runtime = fakeRuntime();
    const token = registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime });

    expect(getActiveCustomerEditSurfaceDescriptor()).toEqual({ token, entityId: "cust_1", activeTab: "identity" });

    unregisterCustomerEditSurfaceTarget(token);
    expect(getActiveCustomerEditSurfaceDescriptor()).toBeNull();
  });

  it("a stale unregister (superseded by a newer registration) does not clobber the newer target", () => {
    const runtimeA = fakeRuntime();
    const tokenA = registerCustomerEditSurfaceTarget({ entityId: "cust_a", runtime: runtimeA });

    const runtimeB = fakeRuntime();
    const tokenB = registerCustomerEditSurfaceTarget({ entityId: "cust_b", runtime: runtimeB });

    unregisterCustomerEditSurfaceTarget(tokenA);

    expect(getActiveCustomerEditSurfaceDescriptor()).toEqual({ token: tokenB, entityId: "cust_b", activeTab: "identity" });
  });

  it("dispatch on a mounted runtime instance applies the command via executeSurfaceAction", async () => {
    const runtime = fakeRuntime();
    const token = registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime });

    const result = await dispatchCustomerEditSurfaceCommand(token, { type: "select_tab", tabId: "address" });

    expect(result).toEqual({ status: "EXECUTED", command: { type: "select_tab", tabId: "address" }, appliedField: "activeTab", appliedValue: "address" });
    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({ actionName: "surface.select_tab", payload: { tabId: "address" } });
  });

  it("dispatch with no active surface returns STALE_SURFACE", async () => {
    const result = await dispatchCustomerEditSurfaceCommand("not_a_real_token", { type: "commit" });
    expect(result).toEqual({ status: "STALE_SURFACE" });
  });

  it("dispatch with a token from an unmounted/replaced registration returns STALE_SURFACE, not applying to the new target", async () => {
    const runtimeA = fakeRuntime();
    const tokenA = registerCustomerEditSurfaceTarget({ entityId: "cust_a", runtime: runtimeA });

    // Screen A unmounts, Screen B mounts for a different customer.
    unregisterCustomerEditSurfaceTarget(tokenA);
    const runtimeB = fakeRuntime();
    registerCustomerEditSurfaceTarget({ entityId: "cust_b", runtime: runtimeB });

    const result = await dispatchCustomerEditSurfaceCommand(tokenA, { type: "commit" });

    expect(result).toEqual({ status: "STALE_SURFACE" });
    expect(runtimeB.executeSurfaceAction).not.toHaveBeenCalled();
  });

  it("wraps a throwing runtime call as EXECUTION_FAILED instead of propagating", async () => {
    const runtime = fakeRuntime();
    runtime.executeSurfaceAction.mockRejectedValueOnce(new Error("boom"));
    const token = registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime });

    const result = await dispatchCustomerEditSurfaceCommand(token, {
      type: "set_field",
      field: { kind: "top", field: "phone" },
      value: "222",
    });

    expect(result).toEqual({ status: "EXECUTION_FAILED", error: "boom" });
  });
});
