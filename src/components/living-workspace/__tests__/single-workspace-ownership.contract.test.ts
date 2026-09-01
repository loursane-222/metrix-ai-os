import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createCustomerWorkspaceDirective, createPaymentWorkspaceDirective } from "@/lib/living-workspace/planner";
import { livingWorkspaceRuntime } from "@/lib/living-workspace/runtime";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical single Workspace ownership", () => {
  beforeEach(() => livingWorkspaceRuntime.resetForTests());

  it("replaces the active domain directive instead of appending another workspace", () => {
    const customers = createCustomerWorkspaceDirective({ route: "/metrix/customers", source: "written", correlationId: "customers" })!;
    const collections = createPaymentWorkspaceDirective({ route: "/metrix/collections", source: "written", correlationId: "collections" })!;
    expect(livingWorkspaceRuntime.publish(customers)).toBe(true);
    expect(livingWorkspaceRuntime.publish(collections)).toBe(true);
    expect(livingWorkspaceRuntime.getSnapshot()).toBe(collections);
    expect(livingWorkspaceRuntime.getSnapshot()?.domain).toBe("payment");
  });

  it("mounts collection recommendations inside the canonical domain scroll body, never as a sibling shell", () => {
    const host = read("src/components/living-workspace/LivingWorkspaceHost.tsx");
    const canonical = read("src/components/living-workspace/CanonicalDomainSurface.tsx");
    const shell = read("src/components/living-workspace/ApprovedDomainWorkspace.tsx");
    const recommendations = read("src/components/living-workspace/CollectionActionsPanel.tsx");
    const routeScreen = read("src/components/living-workspace/PaymentCanonicalScreen.tsx");

    expect(host.match(/aria-label="Çalışma Alanı"/gu)).toHaveLength(1);
    expect(host).not.toContain("CollectionActionsPanel");
    expect(canonical).toContain('directive.domain === "payment" ? <CollectionActionsPanel />');
    expect(canonical).toContain("listPrelude={listPrelude}");
    expect(shell.indexOf("{listPrelude}")).toBeGreaterThan(shell.indexOf("data-workspace-scroll-body"));
    expect(recommendations).toContain("data-collection-recommendations");
    expect(recommendations).not.toContain("WorkspaceSurface");
    expect(routeScreen).not.toContain("CollectionActionsPanel");
  });

  it("keeps recommendation data and lifecycle actions reachable", () => {
    const recommendations = read("src/components/living-workspace/CollectionActionsPanel.tsx");
    expect(recommendations).toContain("listCollectionActions()");
    expect(recommendations).toContain("requestCollectionLifecycleAction");
    expect(recommendations).toContain("confirmCollectionLifecycleAction");
    expect(recommendations).toContain("cancelCollectionLifecycleAction");
    expect(recommendations).toContain("Tamamlandı");
    expect(recommendations).toContain("Reddet");
  });

  it("keeps the header and composer stable while the canonical body owns vertical overflow", () => {
    const host = read("src/components/living-workspace/LivingWorkspaceHost.tsx");
    const shell = read("src/components/living-workspace/ApprovedDomainWorkspace.tsx");
    const css = read("src/app/globals.css");
    const chat = read("src/components/metrix-tab/MetrixChatTab.tsx");

    expect(host).toContain("flex h-full min-h-0 flex-col overflow-hidden");
    expect(host).toContain("workspace-global-header shrink-0");
    expect(shell).toContain("data-workspace-scroll-body");
    expect(css).toMatch(/\.approved-domain-workspace\s*\{[^}]*display:flex;[^}]*height:100%;[^}]*min-height:0;[^}]*flex-direction:column;[^}]*overflow:hidden/gu);
    expect(css).toMatch(/\.approved-domain-list\s*\{[^}]*min-height:0;[^}]*flex:1;[^}]*overflow-y:auto/gu);
    expect(css).toMatch(/\.approved-domain-header\s*\{[^}]*flex:none/gu);
    expect(chat).toContain("metrix-main-composer shrink-0");
    expect(chat).toContain("data-conversation-composer");
  });
});
