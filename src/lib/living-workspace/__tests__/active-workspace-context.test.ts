import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomerWorkspaceDirective, livingWorkspaceRuntime, validateActiveWorkspaceContext } from "@/lib/living-workspace";

describe("active workspace context transport", () => {
  beforeEach(() => livingWorkspaceRuntime.resetForTests());

  it("shares whether the current workspace surface is actually open", () => {
    const listener = vi.fn();
    const unsubscribe = livingWorkspaceRuntime.subscribeSurfaceOpen(listener);
    const directive = createCustomerWorkspaceDirective({
      route: "/metrix/customers",
      source: "written",
      correlationId: crypto.randomUUID(),
    });

    expect(directive).not.toBeNull();
    expect(livingWorkspaceRuntime.publish(directive)).toBe(true);
    expect(livingWorkspaceRuntime.getSurfaceOpenSnapshot()).toBe(false);

    livingWorkspaceRuntime.setSurfaceOpen(true);
    expect(livingWorkspaceRuntime.getSurfaceOpenSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    livingWorkspaceRuntime.clear();
    expect(livingWorkspaceRuntime.getSurfaceOpenSnapshot()).toBe(false);
    unsubscribe();
  });

  it("accepts the bounded transport shape and rejects malformed context", () => {
    expect(validateActiveWorkspaceContext({
      domain: "customer",
      businessSurface: "customer-list",
      entityType: "Customer",
      entityId: null,
      title: "Müşteriler",
    })).toEqual({
      domain: "customer",
      businessSurface: "customer-list",
      entityType: "Customer",
      entityId: null,
      title: "Müşteriler",
    });
    expect(validateActiveWorkspaceContext({
      domain: "unknown",
      businessSurface: null,
      entityType: null,
      entityId: null,
      title: "Geçersiz",
    })).toBeNull();
  });
});
