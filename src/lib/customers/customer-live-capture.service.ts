import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { resolveExecutionPermissions } from "@/lib/action-runtime/gateway/execution-context";
import { getCustomerByIdForOrganization, listCustomers } from "@/lib/core/customers/customer.service";
import { listCustomerCustomFields } from "@/lib/field-authority/custom-field.service";
import { mergeCustomFieldDefinitions } from "@/lib/field-authority/field-authority";
import { adaptCustomerCreatePlan, createCustomerEntityResolutionProvider, customerCaptureHandoffProvider } from "./customer-universal-capture-adapter";
import { CUSTOMER_BUILT_IN_FIELDS, customerCustomDefinitionToField } from "./customer-field-registry";
import { resolveCustomerCreatePlan } from "./customer-create-conversation-planner";
import { generateCustomerCreatePlanText } from "./customer-create-conversation-ai-adapter";
import { createHandoffPlan } from "@/lib/universal-capture/handoff";
import { UniversalCaptureOrchestrator } from "@/lib/universal-capture/orchestrator";
import { renderTurkishDelta } from "@/lib/universal-capture/decision-services";
import type { CaptureSource, UniversalCaptureResult } from "@/lib/universal-capture/contracts";
import { adaptConversationCaptureSource } from "@/lib/universal-capture/adapters";
import type { CustomerCreatePlan } from "./customer-create-conversation-plan";

export type LiveCaptureActivation = Readonly<{ result: UniversalCaptureResult; handoff: ReturnType<typeof createHandoffPlan>; deltaConfirmation: string; source: CaptureSource }>;
export function captureActivationMetadata(activation: LiveCaptureActivation | null) { if (!activation) return null; return { captureId: activation.result.captureId, status: activation.result.status, entityStatus: activation.result.entityResolution.status, entityId: activation.result.entityResolution.reference?.entityId ?? null, candidateCount: activation.result.lifecycle.candidateCount, interaction: activation.result.userInteraction, deltaConfirmation: activation.deltaConfirmation, sourceId: activation.source.id, handoffAction: activation.handoff?.actionName ?? null }; }

export async function captureLiveCustomerConversation(input: Readonly<{ authContext: AuthContext; utterance: string; channel: "text" | "voice"; captureId: string; correlationId: string }>): Promise<LiveCaptureActivation | null> {
  const plan = await resolveCustomerCreatePlan({ utterance: input.utterance, pendingContext: null, generateText: generateCustomerCreatePlanText });
  if (plan.kind !== "CREATE_PLAN" || Object.keys(plan.fields).length === 0) return null;
  return captureCustomerPlan({ ...input, plan });
}

export async function captureCustomerPlan(input: Readonly<{ authContext: AuthContext; plan: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>; channel: "text" | "voice"; captureId: string; correlationId: string }>): Promise<LiveCaptureActivation> {
  const plan = input.plan;
  const fields = await customerFields(input.authContext.organization.id);
  const operation = plan.operation ?? (plan.intent === "OPEN" || plan.intent === "OPEN_UPDATE_COMMIT" ? "CREATE" : "ENRICH");
  const now = new Date().toISOString();
  const envelope = adaptCustomerCreatePlan({ captureId: input.captureId, correlationId: input.correlationId, occurredAt: now, receivedAt: now, entityHint: { entityType: "customer", ...(plan.entityReference ? { reference: plan.entityReference } : {}), createIfMissing: operation === "CREATE" }, operation, explicitCommitIntent: plan.explicitCommit, plan, fields, sourceRef: input.correlationId });
  const capture = adaptConversationCaptureSource(envelope, input.channel);
  const source = capture.source;
  const runtime = new UniversalCaptureOrchestrator({ fields: async () => fields, entityProviders: [createCustomerEntityResolutionProvider(customerData)] });
  const context = { organizationId: input.authContext.organization.id, actorId: input.authContext.user.id, permissions: resolveExecutionPermissions(input.authContext.membership.role) };
  const result = await runtime.process(capture, context);
  return Object.freeze({ result, handoff: createHandoffPlan({ result, explicitCommitIntent: plan.explicitCommit, provider: customerCaptureHandoffProvider }), deltaConfirmation: renderTurkishDelta(result.delta), source });
}

export async function createCustomerCaptureRuntime(organizationId: string) { const fields = await customerFields(organizationId); return { fields, runtime: new UniversalCaptureOrchestrator({ fields: async () => fields, entityProviders: [createCustomerEntityResolutionProvider(customerData)] }) }; }

const customerData = {
  async list(organizationId: string) { return listCustomers({ organizationId, limit: 100 }); },
  async baseline(organizationId: string, customerId: string) { const customer = await getCustomerByIdForOrganization(customerId, organizationId); if (!customer) return {}; const record = customer as unknown as Record<string, unknown>; const baseline: Record<string, unknown> = {}; for (const field of CUSTOMER_BUILT_IN_FIELDS) { let value: unknown = record; for (const part of field.key.split(".")) value = value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined; if (value !== undefined && value !== null) { baseline[field.fieldId] = typeof value === "bigint" ? value.toString() : value; } } return baseline; },
};

async function customerFields(organizationId: string) { const custom = await listCustomerCustomFields(organizationId); return mergeCustomFieldDefinitions(CUSTOMER_BUILT_IN_FIELDS, custom.map((record) => customerCustomDefinitionToField({ id: record.id, organizationId: record.organizationId, key: record.key, label: record.label, description: record.description, valueType: record.valueType, required: record.required, options: record.optionsJson, metadata: record.validationJson, defaultValue: record.defaultValueJson, active: record.active }))); }
