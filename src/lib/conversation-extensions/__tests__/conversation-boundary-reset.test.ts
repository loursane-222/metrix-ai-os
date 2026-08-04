import { afterEach, describe, expect, it, vi } from "vitest";

import { resetActiveConversationExtensionState } from "../active-conversation-extension";
import { customerEditConversationExtension } from "../customer-edit-conversation-extension";
import { offerEditConversationExtension } from "../offer-edit-conversation-extension";
import { livingWorkspaceRuntime } from "@/lib/living-workspace/runtime";
import { createCustomerWorkspaceDirective } from "@/lib/living-workspace/planner";
import {
  dispatchCustomerCreateCommand,
  getActiveCustomerCreateSurfaceDescriptor,
  registerCustomerCreateSurface,
  resetCustomerCreateSurfaceForTests,
} from "@/lib/customers/customer-create-surface-command-channel";
import {
  dispatchCustomerEditSurfaceCommand,
  getActiveCustomerEditSurfaceDescriptor,
  registerCustomerEditSurfaceTarget,
  resetCustomerEditSurfaceCommandChannelForTests,
} from "@/lib/customers/customer-edit-surface-command-channel";
import {
  dispatchOfferEditSurfaceCommand,
  getActiveOfferEditSurfaceDescriptor,
  registerOfferEditSurfaceTarget,
  resetOfferEditSurfaceCommandChannelForTests,
} from "@/lib/offers/offer-edit-surface-command-channel";
import {
  dispatchTaskCreateCommand,
  getActiveTaskCreateSurfaceDescriptor,
  registerTaskCreateSurface,
  resetTaskCreateSurfaceForTests,
} from "@/lib/tasks/task-create-surface-command-channel";

// This suite proves the single canonical conversation-change reset boundary
// (resetActiveConversationExtensionState, called by both startNewConversation
// and selectHistoryItem in MetrixChatTab.tsx — see
// conversation-boundary-reset-contract.test.ts for proof both call sites use
// it) actually terminates every stale ownership a previous conversation could
// leave mounted: the Living Workspace surface itself, and each domain's
// surface-command-channel registration.

function fakeCreateRuntime() {
  return { getState: vi.fn(() => ({}) as never), execute: vi.fn(async () => ({ status: "EXECUTED" }) as never) };
}

describe("conversation-change reset boundary — stale surface ownership", () => {
  afterEach(() => {
    resetCustomerCreateSurfaceForTests();
    resetCustomerEditSurfaceCommandChannelForTests();
    resetOfferEditSurfaceCommandChannelForTests();
    resetTaskCreateSurfaceForTests();
    livingWorkspaceRuntime.resetForTests();
  });

  it("1. a new conversation cannot deliver into a Customer Create surface left open by the previous one", async () => {
    const runtime = fakeCreateRuntime();
    const staleToken = registerCustomerCreateSurface(runtime, "op-conversation-a");
    expect(getActiveCustomerCreateSurfaceDescriptor()).toEqual({ token: staleToken, operationId: "op-conversation-a", surface: "customer.create" });

    resetActiveConversationExtensionState(); // simulates startNewConversation()

    expect(getActiveCustomerCreateSurfaceDescriptor()).toBeNull();
    const outcome = await dispatchCustomerCreateCommand(staleToken, { type: "commit" }, "op-conversation-a");
    expect(outcome.status).toBe("REJECTED");
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it("2. selecting a different conversation from history cannot deliver into a surface left open by the previous one", async () => {
    const runtime = fakeCreateRuntime();
    const staleToken = registerCustomerCreateSurface(runtime, "op-conversation-a");

    // selectHistoryItem() calls the exact same boundary function as
    // startNewConversation() — this test exercises the boundary a second,
    // independent time to prove it is idempotent and equally effective
    // regardless of which caller reached it.
    resetActiveConversationExtensionState();

    expect(getActiveCustomerCreateSurfaceDescriptor()).toBeNull();
    const outcome = await dispatchCustomerCreateCommand(staleToken, { type: "commit" }, "op-conversation-a");
    expect(outcome.status).toBe("REJECTED");
  });

  it("3a. Customer Edit cannot intercept another domain's turn after a conversation change", async () => {
    const runtime = { getState: vi.fn(() => ({ activeTab: "identity" }) as never), executeSurfaceAction: vi.fn() };
    const staleToken = registerCustomerEditSurfaceTarget({ entityId: "cust_1", runtime: runtime as never });
    expect(customerEditConversationExtension.getActiveScopeKey()).not.toBeNull();

    resetActiveConversationExtensionState();

    expect(getActiveCustomerEditSurfaceDescriptor()).toBeNull();
    expect(customerEditConversationExtension.getActiveScopeKey()).toBeNull();
    const outcome = await dispatchCustomerEditSurfaceCommand(staleToken, { type: "commit" });
    expect(outcome).toEqual({ status: "STALE_SURFACE" });
    expect(runtime.executeSurfaceAction).not.toHaveBeenCalled();
  });

  it("3b. Offer Edit cannot intercept another domain's turn after a conversation change", async () => {
    const runtime = { getState: vi.fn(() => ({ activeTab: "items" }) as never), executeSurfaceAction: vi.fn() };
    const staleToken = registerOfferEditSurfaceTarget({ entityId: "quote_1", runtime: runtime as never });
    expect(offerEditConversationExtension.getActiveScopeKey()).not.toBeNull();

    resetActiveConversationExtensionState();

    expect(getActiveOfferEditSurfaceDescriptor()).toBeNull();
    expect(offerEditConversationExtension.getActiveScopeKey()).toBeNull();
    const outcome = await dispatchOfferEditSurfaceCommand(staleToken, { type: "commit" });
    expect(outcome).toEqual({ status: "STALE_SURFACE" });
    expect(runtime.executeSurfaceAction).not.toHaveBeenCalled();
  });

  it("3c. Task Create cannot intercept another domain's turn after a conversation change", async () => {
    const runtime = { getState: vi.fn(() => ({}) as never), execute: vi.fn(async () => ({ status: "EXECUTED" }) as never) };
    const staleToken = registerTaskCreateSurface(runtime, "op-task-a");

    resetActiveConversationExtensionState();

    expect(getActiveTaskCreateSurfaceDescriptor()).toBeNull();
    const outcome = await dispatchTaskCreateCommand(staleToken, { type: "commit" }, "op-task-a");
    expect(outcome.status).toBe("REJECTED");
  });

  it("4. a fresh command in the new conversation binds to a fresh surface instance, distinct from the reset one", async () => {
    const staleRuntime = fakeCreateRuntime();
    const staleToken = registerCustomerCreateSurface(staleRuntime, "op-conversation-a");

    resetActiveConversationExtensionState();

    const freshRuntime = fakeCreateRuntime();
    const freshToken = registerCustomerCreateSurface(freshRuntime, "op-conversation-b");

    expect(freshToken).not.toBe(staleToken);
    expect(getActiveCustomerCreateSurfaceDescriptor()).toEqual({ token: freshToken, operationId: "op-conversation-b", surface: "customer.create" });

    const freshOutcome = await dispatchCustomerCreateCommand(freshToken, { type: "commit" }, "op-conversation-b");
    expect(freshOutcome.status).toBe("EXECUTED");
    expect(freshRuntime.execute).toHaveBeenCalledTimes(1);

    // 5. the previous operationId/token can still never commit, even after a fresh surface exists.
    const staleOutcome = await dispatchCustomerCreateCommand(staleToken, { type: "commit" }, "op-conversation-a");
    expect(staleOutcome.status).toBe("REJECTED");
    expect(staleRuntime.execute).not.toHaveBeenCalled();
  });

  it("5. the previous operation's descriptor can never be resolved again to receive a command, even by its own operationId", async () => {
    const runtime = fakeCreateRuntime();
    registerCustomerCreateSurface(runtime, "op-conversation-a");
    resetActiveConversationExtensionState();

    // No active surface exists at all — dispatching against the old
    // operationId with a guessed/replayed token still cannot resolve.
    const outcome = await dispatchCustomerCreateCommand("any-guessed-token", { type: "commit" }, "op-conversation-a");
    expect(outcome.status).toBe("REJECTED");
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it("clears the mounted Living Workspace surface itself, not just the domain channels", () => {
    const directive = createCustomerWorkspaceDirective({ route: "/metrix/customers/new", source: "voice", correlationId: "create-a" });
    expect(directive).not.toBeNull();
    livingWorkspaceRuntime.publish(directive);
    expect(livingWorkspaceRuntime.getSnapshot()).not.toBeNull();

    resetActiveConversationExtensionState();

    expect(livingWorkspaceRuntime.getSnapshot()).toBeNull();
  });

  it("is idempotent when called with nothing active (normal case: most conversation changes have no open surface)", () => {
    expect(() => resetActiveConversationExtensionState()).not.toThrow();
    expect(() => resetActiveConversationExtensionState()).not.toThrow();
  });
});
