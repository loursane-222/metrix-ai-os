import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { livingWorkspaceRuntime } from "../runtime";

const hook = readFileSync(
  new URL("../use-active-workspace-context.ts", import.meta.url),
  "utf8",
);

const surface = readFileSync(
  new URL(
    "../../../components/living-workspace/CanonicalDomainSurface.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Living Workspace — visible entity context", () => {
  beforeEach(() => {
    livingWorkspaceRuntime.resetForTests();
  });

  it("stores the visible detail centrally", () => {
    livingWorkspaceRuntime.setActiveContextOverride({
      domain: "customer",
      businessSurface: null,
      entityType: "Customer",
      entityId: "customer-1",
      title: "Acme",
    });

    expect(
      livingWorkspaceRuntime.getActiveContextOverrideSnapshot(),
    ).toMatchObject({
      entityType: "Customer",
      entityId: "customer-1",
      title: "Acme",
    });
  });

  it("clears the visible detail centrally", () => {
    livingWorkspaceRuntime.setActiveContextOverride({
      domain: "customer",
      businessSurface: null,
      entityType: "Customer",
      entityId: "customer-2",
      title: "Beta",
    });

    livingWorkspaceRuntime.clearActiveContextOverride();

    expect(
      livingWorkspaceRuntime.getActiveContextOverrideSnapshot(),
    ).toBeNull();
  });

  it("cannot leak a selected record after Workspace closes", () => {
    livingWorkspaceRuntime.setSurfaceOpen(true);

    livingWorkspaceRuntime.setActiveContextOverride({
      domain: "customer",
      businessSurface: null,
      entityType: "Customer",
      entityId: "customer-3",
      title: "Gamma",
    });

    livingWorkspaceRuntime.setSurfaceOpen(false);

    expect(
      livingWorkspaceRuntime.getActiveContextOverrideSnapshot(),
    ).toBeNull();
  });

  it("chat prefers the visible detail over the parent list", () => {
    expect(hook).toContain("subscribeActiveContextOverride");
    expect(hook).toContain("getActiveContextOverrideSnapshot");
    expect(hook).toContain("return activeContextOverride ??");
  });

  it("detail open and close update the same shared context", () => {
    expect(surface).toContain(
      "livingWorkspaceRuntime.setActiveContextOverride({",
    );
    expect(surface).toContain(
      "entityId: String(row.id)",
    );
    expect(surface).toContain(
      "livingWorkspaceRuntime.clearActiveContextOverride();",
    );
  });
});
