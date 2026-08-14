import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchOrderEditSurfaceCommand, getActiveOrderEditSurfaceDescriptor, registerOrderEditSurfaceTarget, resetOrderEditSurfaceCommandChannelForTests, unregisterOrderEditSurfaceTarget } from "../order-edit-surface-command-channel";

function runtime() { return { getState: () => ({ activeTab: "actions" as const }), applyCommand: vi.fn(async (command) => ({ status: "EXECUTED" as const, command })) }; }
describe("order edit surface command channel", () => {
  afterEach(resetOrderEditSurfaceCommandChannelForTests);
  it("registers and unregisters the mounted target", () => { const target = runtime(); const token = registerOrderEditSurfaceTarget({ entityId: "order_1", runtime: target }); expect(getActiveOrderEditSurfaceDescriptor()).toEqual({ token, entityId: "order_1", activeTab: "actions" }); unregisterOrderEditSurfaceTarget(token); expect(getActiveOrderEditSurfaceDescriptor()).toBeNull(); });
  it("does not let stale cleanup clobber a newer target", () => { const old = registerOrderEditSurfaceTarget({ entityId: "old", runtime: runtime() }); const current = registerOrderEditSurfaceTarget({ entityId: "new", runtime: runtime() }); unregisterOrderEditSurfaceTarget(old); expect(getActiveOrderEditSurfaceDescriptor()?.token).toBe(current); });
  it("dispatches through the runtime and rejects stale tokens", async () => { const target = runtime(); const token = registerOrderEditSurfaceTarget({ entityId: "order_1", runtime: target }); const command = { type: "revise_deadline" as const, deadlineAt: null }; expect(await dispatchOrderEditSurfaceCommand(token, command)).toEqual({ status: "EXECUTED", command }); expect(target.applyCommand).toHaveBeenCalledWith(command); expect(await dispatchOrderEditSurfaceCommand("stale", command)).toEqual({ status: "STALE_SURFACE" }); });
});
