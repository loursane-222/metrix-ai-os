import { ActionRegistry, createActionRegistry } from "./action-registry";
import { collectionActionDefinitions } from "./manifests/collections.actions";
import { customerActionDefinitions } from "./manifests/customers.actions";
import { paymentActionDefinitions } from "./manifests/payments.actions";
import { quoteActionDefinitions } from "./manifests/quotes.actions";
import { surfaceActionDefinitions } from "./manifests/surface.actions";
import type { ActionDefinition } from "./action-registry.types";

export * from "./action-registry.errors";
export * from "./action-registry.types";
export { ActionRegistry, createActionRegistry };

/**
 * Registry mantıksal olarak merkezi, fiziksel olarak federatiftir:
 * her modül kendi manifest dosyasının sahibidir, bu dosya yalnızca
 * onları birleştirir. Yeni bir modül eklemek, buraya bir manifest
 * daha eklemekten ibarettir — çekirdek ActionRegistry değişmez.
 */
const MODULE_MANIFESTS: readonly ActionDefinition[][] = [
  customerActionDefinitions,
  quoteActionDefinitions,
  paymentActionDefinitions,
  collectionActionDefinitions,
  surfaceActionDefinitions,
];

function bootstrapActionRegistry(): ActionRegistry {
  const registry = createActionRegistry();

  for (const manifest of MODULE_MANIFESTS) {
    registry.registerMany(manifest);
  }

  return registry;
}

export const actionRegistry = bootstrapActionRegistry();
