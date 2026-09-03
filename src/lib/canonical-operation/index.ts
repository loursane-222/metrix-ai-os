export * from "./types";
export {
  registerCapability,
  getCapability,
  listCapabilities,
  listCapabilitiesByDomain,
  resolveNativeActionDefinition,
  type CapabilityClassification,
  type CapabilityDescriptor,
  type CapabilityImplementation,
  type CapabilityReadImplementation,
  type CapabilityWriteImplementation,
  type CapabilityNavigationImplementation,
} from "./capability-registry";
export { bootstrapCapabilityRegistry } from "./capabilities";
export { executeCanonicalOperation, type ExecuteCanonicalOperationDeps } from "./native-connector";
export { canonicalOperationResultToHttpResponse, toLegacyExecutionShape, type LegacyExecutionShape } from "./http-response";
export { resolveContinuityEntity, type ContinuityEntityResolution } from "./entity-continuity";
