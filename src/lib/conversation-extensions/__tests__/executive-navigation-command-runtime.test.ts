import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchConversationNavigation, ExecutiveNavigationCommandRuntime, executiveNavigationCommandRuntime, normalizePathname, registerExecutiveNavigationHandler, resetConversationNavigationHandlerForTests } from "../conversation-navigation-runtime";

const input = { correlationId: "correlation-1", source: "written" as const, route: "/metrix/customers/new", expectedSurfaceAuthorityKey: "customers.customer.create", commandId: "command-1" };

describe("ExecutiveNavigationCommandRuntime", () => {
  beforeEach(() => resetConversationNavigationHandlerForTests());
  it("publishes a typed command before dispatching navigation", async () => {
    let observed = "";
    registerExecutiveNavigationHandler((command) => { observed = `${executiveNavigationCommandRuntime.getSnapshot()?.commandId}:${command.route}`; });
    const completion = dispatchConversationNavigation(input);
    expect(observed).toBe("command-1:/metrix/customers/new");
    expect(executiveNavigationCommandRuntime.getSnapshot()).toMatchObject({ state: "NAVIGATING", generation: 1, source: "written" });
    expect(executiveNavigationCommandRuntime.acknowledgeRoute("command-1", 1, "/metrix")).toBe(false);
    expect(executiveNavigationCommandRuntime.acknowledgeRoute("command-1", 1, "/metrix/customers/new/")).toBe(true);
    expect(executiveNavigationCommandRuntime.getSnapshot()).toMatchObject({ state: "WAITING_FOR_SURFACE" });
    executiveNavigationCommandRuntime.finish("command-1", 1, "COMPLETED", []);
    await expect(completion).resolves.toMatchObject({ status: "COMPLETED" });
  });
  it("allows only one claim", () => {
    const runtime = new ExecutiveNavigationCommandRuntime(() => 1, () => 1 as never, vi.fn());
    const { command } = runtime.publish(input);
    expect(runtime.transition(command.commandId, command.generation, "WAITING_FOR_SURFACE")).toBe(true);
    expect(runtime.transition(command.commandId, command.generation, "CLAIMED")).toBe(true);
    expect(runtime.transition(command.commandId, command.generation, "CLAIMED")).toBe(false);
  });
  it("supersedes generations and ignores stale completion", async () => {
    const runtime = new ExecutiveNavigationCommandRuntime(() => 1, () => 1 as never, vi.fn());
    const first = runtime.publish(input); const second = runtime.publish({ ...input, commandId: "command-2", correlationId: "correlation-2" });
    await expect(first.completion).resolves.toMatchObject({ status: "SUPERSEDED" });
    expect(runtime.finish(first.command.commandId, first.command.generation, "COMPLETED", ["wrong"])).toBe(false);
    expect(runtime.getSnapshot()?.commandId).toBe(second.command.commandId);
  });
  it("expires with an injected scheduler", async () => {
    let expire: (() => void) | undefined;
    const runtime = new ExecutiveNavigationCommandRuntime(() => 100, (callback) => { expire = callback; return 1 as never; }, vi.fn());
    const pending = runtime.publish({ ...input, ttlMs: 5 }); expire?.();
    await expect(pending.completion).resolves.toMatchObject({ status: "EXPIRED" });
  });
  it("does not let a superseded generation advance on a late pathname acknowledgement", () => {
    const runtime = new ExecutiveNavigationCommandRuntime(() => 1, () => 1 as never, vi.fn());
    const first = runtime.publish(input); runtime.transition(first.command.commandId, first.command.generation, "NAVIGATING");
    const second = runtime.publish({ ...input, commandId: "command-2" }); runtime.transition(second.command.commandId, second.command.generation, "NAVIGATING");
    expect(runtime.acknowledgeRoute(first.command.commandId, first.command.generation, input.route)).toBe(false);
    expect(runtime.acknowledgeRoute(second.command.commandId, second.command.generation, input.route)).toBe(true);
  });
  it("normalizes query strings, duplicate slashes, and trailing slashes", () => {
    expect(normalizePathname("/metrix//customers/new/?source=chat")).toBe("/metrix/customers/new");
    expect(normalizePathname("/")).toBe("/");
  });
  it("fails an unsafe route without invoking the layout router owner", async () => {
    const navigate = vi.fn(); registerExecutiveNavigationHandler(navigate);
    await expect(dispatchConversationNavigation({ ...input, commandId: "unsafe", route: "https://example.com" })).resolves.toMatchObject({ status: "FAILED", message: "Geçersiz gezinme hedefi." });
    expect(navigate).not.toHaveBeenCalled();
  });
});
