import type { ActionHandler, ActionExecutionEnvelope } from "../../execution";
import { createApprovedCustomFieldDefinition, deprecateCustomerCustomField, updateApprovedCustomFieldDefinition } from "@/lib/field-authority/custom-field.service";
import type { DomainEventDescriptor } from "../../events";

function event(type: string, id: string, envelope: ActionExecutionEnvelope, metadata: Record<string, unknown>): DomainEventDescriptor {
  return { eventType: type, aggregateType: "custom_field_definition", aggregateId: id, schemaVersion: "1", payload: { definitionId: id, actorId: envelope.executionContext.actorId, ...metadata } };
}
export const customFieldCreateHandler: ActionHandler = async (envelope) => {
  const input = envelope.input;
  const definition = await createApprovedCustomFieldDefinition({ ...input, organizationId: envelope.executionContext.organizationId, actorId: envelope.executionContext.actorId } as Parameters<typeof createApprovedCustomFieldDefinition>[0]);
  return { status: "SUCCESS", entityRef: { entityType: "custom_field_definition", entityId: definition.id }, resultSummary: "custom_field.create completed.", metadata: { definitionId: definition.id, key: definition.key, valueType: definition.valueType }, domainEvents: [event("CustomFieldDefinitionCreated", definition.id, envelope, { key: definition.key, valueType: definition.valueType })], sideEffects: [] };
};
export const customFieldUpdateHandler: ActionHandler = async (envelope) => {
  const definition = await updateApprovedCustomFieldDefinition({ ...envelope.input, organizationId: envelope.executionContext.organizationId, actorId: envelope.executionContext.actorId } as Parameters<typeof updateApprovedCustomFieldDefinition>[0]);
  return { status: "SUCCESS", entityRef: { entityType: "custom_field_definition", entityId: definition.id }, resultSummary: "custom_field.update_definition completed.", metadata: { definitionId: definition.id, key: definition.key, valueType: definition.valueType }, domainEvents: [event("CustomFieldDefinitionUpdated", definition.id, envelope, { key: definition.key, valueType: definition.valueType })], sideEffects: [] };
};
export const customFieldDeprecateHandler: ActionHandler = async (envelope) => {
  const definitionId = String(envelope.input.definitionId);
  await deprecateCustomerCustomField({ organizationId: envelope.executionContext.organizationId, definitionId });
  return { status: "SUCCESS", entityRef: { entityType: "custom_field_definition", entityId: definitionId }, resultSummary: "custom_field.deprecate completed.", metadata: { definitionId }, domainEvents: [event("CustomFieldDefinitionDeprecated", definitionId, envelope, {})], sideEffects: [] };
};
