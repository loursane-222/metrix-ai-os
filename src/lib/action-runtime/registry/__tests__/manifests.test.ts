import { describe, expect, it } from "vitest";

import { createActionRegistry } from "../action-registry";
import { collectionActionDefinitions } from "../manifests/collections.actions";
import { customerActionDefinitions } from "../manifests/customers.actions";
import { paymentActionDefinitions } from "../manifests/payments.actions";
import { quoteActionDefinitions } from "../manifests/quotes.actions";
import { surfaceActionDefinitions } from "../manifests/surface.actions";

const ALL_MANIFESTS = [
  customerActionDefinitions,
  quoteActionDefinitions,
  paymentActionDefinitions,
  collectionActionDefinitions,
  surfaceActionDefinitions,
];

describe("federated module manifests", () => {
  it("bootstrap without any duplicate or invalid definitions", () => {
    const registry = createActionRegistry();

    expect(() => {
      for (const manifest of ALL_MANIFESTS) {
        registry.registerMany(manifest);
      }
    }).not.toThrow();

    const totalDefinitions = ALL_MANIFESTS.reduce((sum, manifest) => sum + manifest.length, 0);
    expect(registry.listAllActions()).toHaveLength(totalDefinitions);
  });

  it("scopes customer manifest entries to the customers module", () => {
    const registry = createActionRegistry();
    registry.registerMany(customerActionDefinitions);

    const actions = registry.listActionsByModule("customers");
    expect(actions.map((action) => action.actionName).sort()).toEqual(
      ["custom_field.create", "custom_field.deprecate", "custom_field.update_definition", "customer.archive", "customer.create", "customer.update"].sort(),
    );
  });

  it("classifies surface manifest entries as SURFACE actions", () => {
    const registry = createActionRegistry();
    registry.registerMany(surfaceActionDefinitions);

    expect(registry.listActionsByClass("SURFACE")).toHaveLength(surfaceActionDefinitions.length);
    expect(registry.listActionsByClass("DOMAIN")).toHaveLength(0);
  });

  it("classifies business manifests as DOMAIN actions", () => {
    const registry = createActionRegistry();
    registry.registerMany([
      ...customerActionDefinitions,
      ...quoteActionDefinitions,
      ...paymentActionDefinitions,
      ...collectionActionDefinitions,
    ]);

    const domainActions = registry.listActionsByClass("DOMAIN");
    expect(domainActions).toHaveLength(
      customerActionDefinitions.length +
        quoteActionDefinitions.length +
        paymentActionDefinitions.length +
        collectionActionDefinitions.length,
    );
  });

  it("high-risk customer.archive requires explicit, short-lived approval", () => {
    const registry = createActionRegistry();
    registry.registerMany(customerActionDefinitions);

    const archive = registry.getActionDefinition("customer.archive");
    expect(archive.riskLevelBase).toBe("HIGH");
    expect(archive.approvalPolicy).toBe("EXPLICIT");
    expect(archive.approvalTtlClass).toBe("SHORT");
  });
});
