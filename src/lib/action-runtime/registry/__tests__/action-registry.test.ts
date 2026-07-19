import { describe, expect, it } from "vitest";

import { createActionRegistry } from "../action-registry";
import { ActionNotFoundError, DuplicateActionDefinitionError, InvalidActionDefinitionError } from "../action-registry.errors";
import type { ActionDefinition } from "../action-registry.types";

function buildDefinition(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    actionName: "customer.update",
    actionClass: "DOMAIN",
    ownerModule: "customers",
    inputSchema: {
      customerId: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["customers.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
    ...overrides,
  };
}

describe("ActionRegistry — registration", () => {
  it("registers a valid action definition", () => {
    const registry = createActionRegistry();

    registry.register(buildDefinition());

    expect(registry.hasAction("customer.update")).toBe(true);
  });

  it("rejects a duplicate action name", () => {
    const registry = createActionRegistry();
    registry.register(buildDefinition());

    expect(() => registry.register(buildDefinition())).toThrow(DuplicateActionDefinitionError);
  });

  it("rejects a duplicate action name across different owner modules", () => {
    const registry = createActionRegistry();
    registry.register(buildDefinition({ actionName: "shared.action", ownerModule: "customers" }));

    expect(() =>
      registry.register(buildDefinition({ actionName: "shared.action", ownerModule: "quotes" })),
    ).toThrow(DuplicateActionDefinitionError);
  });

  it.each([
    ["missing actionName", { actionName: "" }],
    ["invalid actionClass", { actionClass: "WORKFLOW" as unknown as ActionDefinition["actionClass"] }],
    ["missing ownerModule", { ownerModule: "" }],
    ["invalid riskLevelBase", { riskLevelBase: "EXTREME" as unknown as ActionDefinition["riskLevelBase"] }],
    ["non-array requiredPermissionSet", { requiredPermissionSet: undefined as unknown as string[] }],
    ["invalid approvalPolicy", { approvalPolicy: "MAYBE" as unknown as ActionDefinition["approvalPolicy"] }],
    ["invalid approvalTtlClass", { approvalTtlClass: "FOREVER" as unknown as ActionDefinition["approvalTtlClass"] }],
    ["non-boolean isReversible", { isReversible: "yes" as unknown as boolean }],
    ["empty-string compensationRef", { compensationRef: "" }],
    ["malformed inputSchema", { inputSchema: null as unknown as ActionDefinition["inputSchema"] }],
    [
      "inputSchema field missing type",
      {
        inputSchema: {
          customerId: { required: true } as unknown as ActionDefinition["inputSchema"][string],
        },
      },
    ],
  ])("rejects a definition with %s", (_label, overrides) => {
    const registry = createActionRegistry();

    expect(() => registry.register(buildDefinition(overrides))).toThrow(InvalidActionDefinitionError);
    expect(registry.listAllActions()).toHaveLength(0);
  });

  it("registers every definition in a manifest via registerMany", () => {
    const registry = createActionRegistry();

    registry.registerMany([
      buildDefinition({ actionName: "customer.create" }),
      buildDefinition({ actionName: "customer.archive" }),
    ]);

    expect(registry.listAllActions()).toHaveLength(2);
  });

  it("registers no definitions when one entry in registerMany is invalid", () => {
    const registry = createActionRegistry();

    expect(() =>
      registry.registerMany([
        buildDefinition({ actionName: "customer.create" }),
        buildDefinition({ actionName: "" }),
      ]),
    ).toThrow(InvalidActionDefinitionError);

    expect(registry.hasAction("customer.create")).toBe(false);
  });

  it("registerMany is atomic when a batch contains duplicate action names", () => {
    const registry = createActionRegistry();

    expect(() => registry.registerMany([
      buildDefinition({ actionName: "customer.create" }),
      buildDefinition({ actionName: "customer.create" }),
    ])).toThrow(DuplicateActionDefinitionError);

    expect(registry.listAllActions()).toEqual([]);
  });
});

describe("ActionRegistry — lookup", () => {
  it("finds an action definition by name", () => {
    const registry = createActionRegistry();
    const definition = buildDefinition();
    registry.register(definition);

    expect(registry.getActionDefinition("customer.update")).toEqual(definition);
  });

  it("throws ActionNotFoundError for an unregistered action name", () => {
    const registry = createActionRegistry();

    expect(() => registry.getActionDefinition("customer.unknown")).toThrow(ActionNotFoundError);
  });

  it("reports hasAction correctly for missing actions", () => {
    const registry = createActionRegistry();

    expect(registry.hasAction("customer.unknown")).toBe(false);
  });
});

describe("ActionRegistry — module lookup", () => {
  it("lists actions scoped to a single owner module", () => {
    const registry = createActionRegistry();
    registry.registerMany([
      buildDefinition({ actionName: "customer.create", ownerModule: "customers" }),
      buildDefinition({ actionName: "customer.archive", ownerModule: "customers" }),
      buildDefinition({ actionName: "quote.create", ownerModule: "quotes" }),
    ]);

    const customerActions = registry.listActionsByModule("customers");

    expect(customerActions).toHaveLength(2);
    expect(customerActions.every((action) => action.ownerModule === "customers")).toBe(true);
  });

  it("returns an empty list for a module with no registered actions", () => {
    const registry = createActionRegistry();

    expect(registry.listActionsByModule("finance")).toEqual([]);
  });
});

describe("ActionRegistry — class filters", () => {
  it("filters SURFACE actions separately from DOMAIN actions", () => {
    const registry = createActionRegistry();
    registry.registerMany([
      buildDefinition({ actionName: "customer.update", actionClass: "DOMAIN" }),
      buildDefinition({ actionName: "draft.set_field", actionClass: "SURFACE", ownerModule: "surface" }),
    ]);

    expect(registry.listActionsByClass("DOMAIN")).toHaveLength(1);
    expect(registry.listActionsByClass("SURFACE")).toHaveLength(1);
    expect(registry.listActionsByClass("DOMAIN")[0].actionName).toBe("customer.update");
    expect(registry.listActionsByClass("SURFACE")[0].actionName).toBe("draft.set_field");
  });

  it("lists every registered action regardless of class", () => {
    const registry = createActionRegistry();
    registry.registerMany([
      buildDefinition({ actionName: "customer.update", actionClass: "DOMAIN" }),
      buildDefinition({ actionName: "draft.set_field", actionClass: "SURFACE", ownerModule: "surface" }),
    ]);

    expect(registry.listAllActions()).toHaveLength(2);
  });

  it("uses actionName as a stable ordering tie-break independent of registration order", () => {
    const registry = createActionRegistry();
    registry.registerMany([
      buildDefinition({ actionName: "quote.create", ownerModule: "quotes" }),
      buildDefinition({ actionName: "customer.archive" }),
    ]);

    expect(registry.listAllActions().map((definition) => definition.actionName)).toEqual([
      "customer.archive",
      "quote.create",
    ]);
  });
});
