import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/shared/prisma";
import { productionExecutionRuntime } from "@/lib/action-runtime/composition/production-execution-runtime";
import { buildActionExecutionRequest } from "@/lib/action-runtime/gateway/execution-request";
import { buildExecutionContext } from "@/lib/action-runtime/gateway/execution-context";
import { actionRegistry } from "@/lib/action-runtime/registry";
import { policyEngine } from "@/lib/action-runtime/policy";
import type { ApprovalGrant } from "@/lib/action-runtime/policy";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { buildActionCatalog } from "./action-catalog";
import { ENTITY_REFERENCE_FIELDS } from "./entity-resolvers";
import { isStepReference } from "./executive-orchestration.types";
import type {
  OrchestrationPlan,
  OrchestrationStepArgs,
  OrchestrationStepResult,
  OrchestrationView,
} from "./executive-orchestration.types";

const CATALOG_BY_NAME = new Map(buildActionCatalog().map((action) => [action.actionName, action]));

// Sequential runtime — see executive-orchestration.types.ts for what's
// deliberately out of scope. A step that fails halts the chain (remaining
// steps marked SKIPPED, earlier COMPLETED steps left as-is — no
// compensation/rollback yet). A step requiring EXPLICIT approval instead
// pauses the whole chain in AWAITING_APPROVAL — resumeOrchestration()
// grants it and continues the same sequence in a later turn.
export async function runOrchestration(input: {
  auth: AuthContext;
  triggerUtterance: string;
  plan: OrchestrationPlan;
}): Promise<OrchestrationView> {
  const organizationId = input.auth.organization.id;

  const created = await prisma.executiveOrchestration.create({
    data: {
      organizationId,
      triggerUtterance: input.triggerUtterance,
      triggerUserId: input.auth.user.id,
      status: "RUNNING",
      steps: {
        create: input.plan.steps.map((step, index) => ({
          organizationId,
          sequence: index + 1,
          domain: step.domain,
          actionName: step.actionName,
          status: "PENDING" as const,
          input: step.argsTemplate as Prisma.InputJsonValue,
        })),
      },
    },
  });

  return continueOrchestrationSteps({ auth: input.auth, orchestrationId: created.id });
}

// Grants the pending approval for an AWAITING_APPROVAL orchestration and
// resumes the same sequence from that exact step. Returns null if there is
// nothing to resume (already resolved, not found, or not this org's).
export async function resumeOrchestration(input: {
  auth: AuthContext;
  orchestrationId: string;
}): Promise<OrchestrationView | null> {
  const organizationId = input.auth.organization.id;
  const orchestration = await prisma.executiveOrchestration.findFirst({
    where: { id: input.orchestrationId, organizationId, status: "AWAITING_APPROVAL" },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
  if (!orchestration) return null;

  const awaitingStep = orchestration.steps.find((step) => step.status === "AWAITING_APPROVAL");
  if (!awaitingStep?.approvalRequestId) return null;

  let grant: ApprovalGrant;
  try {
    grant = await policyEngine.grantApproval(awaitingStep.approvalRequestId, input.auth.user.id);
  } catch (error) {
    await prisma.orchestrationStep.updateMany({
      where: { id: awaitingStep.id, organizationId },
      data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Onay verilemedi.", completedAt: new Date() },
    });
    await prisma.executiveOrchestration.updateMany({
      where: { id: orchestration.id, organizationId },
      data: { status: orchestration.steps.some((step) => step.status === "COMPLETED") ? "PARTIALLY_COMPLETED" : "FAILED", completedAt: new Date() },
    });
    return getOrchestrationById(orchestration.id, organizationId);
  }

  await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "RUNNING" } });
  return continueOrchestrationSteps({ auth: input.auth, orchestrationId: orchestration.id, resumeApproval: { stepId: awaitingStep.id, grant } });
}

export async function findMostRecentAwaitingApproval(organizationId: string): Promise<OrchestrationView | null> {
  const orchestration = await prisma.executiveOrchestration.findFirst({
    where: { organizationId, status: "AWAITING_APPROVAL" },
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
  return orchestration ? toView(orchestration) : null;
}

async function continueOrchestrationSteps(input: {
  auth: AuthContext;
  orchestrationId: string;
  resumeApproval?: { stepId: string; grant: ApprovalGrant };
}): Promise<OrchestrationView> {
  const organizationId = input.auth.organization.id;
  const orchestration = await prisma.executiveOrchestration.findFirstOrThrow({
    where: { id: input.orchestrationId, organizationId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });

  const priorResults: (OrchestrationStepResult | null)[] = orchestration.steps.map((step) =>
    step.status === "COMPLETED" && step.resultEntityType && step.resultEntityId
      ? { entityType: step.resultEntityType, entityId: step.resultEntityId }
      : null,
  );
  let anyFailed = orchestration.steps.some((step) => step.status === "FAILED");
  let anySucceeded = orchestration.steps.some((step) => step.status === "COMPLETED");

  for (const step of orchestration.steps) {
    if (step.status === "COMPLETED" || step.status === "FAILED" || step.status === "SKIPPED") continue;

    if (anyFailed) {
      await prisma.orchestrationStep.updateMany({ where: { id: step.id, organizationId }, data: { status: "SKIPPED" } });
      continue;
    }

    const args = resolveStepArgs((step.input ?? {}) as OrchestrationStepArgs, priorResults);
    if (!args) {
      await prisma.orchestrationStep.updateMany({
        where: { id: step.id, organizationId },
        data: { status: "FAILED", errorMessage: "Referenced an earlier step whose result is not available.", completedAt: new Date() },
      });
      anyFailed = true;
      continue;
    }

    await prisma.orchestrationStep.updateMany({ where: { id: step.id, organizationId }, data: { status: "RUNNING", startedAt: new Date() } });

    const approvalGrant = input.resumeApproval?.stepId === step.id ? input.resumeApproval.grant : undefined;
    const outcome = await executeOneStep({
      auth: input.auth,
      orchestrationId: orchestration.id,
      step: { id: step.id, sequence: step.sequence, actionName: step.actionName },
      args,
      approvalGrant,
    });

    if (outcome.kind === "AWAITING_APPROVAL") {
      await prisma.orchestrationStep.updateMany({
        where: { id: step.id, organizationId },
        data: { status: "AWAITING_APPROVAL", approvalRequestId: outcome.approvalRequestId },
      });
      await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "AWAITING_APPROVAL" } });
      return (await getOrchestrationById(orchestration.id, organizationId))!;
    }

    if (outcome.kind === "FAILED") {
      await prisma.orchestrationStep.updateMany({
        where: { id: step.id, organizationId },
        data: { status: "FAILED", errorMessage: outcome.error, completedAt: new Date() },
      });
      anyFailed = true;
      continue;
    }

    await prisma.orchestrationStep.updateMany({
      where: { id: step.id, organizationId },
      data: { status: "COMPLETED", resultEntityType: outcome.entityRef.entityType, resultEntityId: outcome.entityRef.entityId, completedAt: new Date() },
    });
    anySucceeded = true;
    priorResults[step.sequence - 1] = outcome.entityRef;
  }

  const finalStatus = anyFailed ? (anySucceeded ? "PARTIALLY_COMPLETED" : "FAILED") : "COMPLETED";
  await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: finalStatus, completedAt: new Date() } });
  return (await getOrchestrationById(orchestration.id, organizationId))!;
}

type StepExecutionOutcome =
  | Readonly<{ kind: "COMPLETED"; entityRef: OrchestrationStepResult }>
  | Readonly<{ kind: "AWAITING_APPROVAL"; approvalRequestId: string }>
  | Readonly<{ kind: "FAILED"; error: string }>;

async function executeOneStep(input: {
  auth: AuthContext;
  orchestrationId: string;
  step: { id: string; sequence: number; actionName: string };
  args: Record<string, unknown>;
  approvalGrant?: ApprovalGrant;
}): Promise<StepExecutionOutcome> {
  const request = buildActionExecutionRequest({
    actionName: input.step.actionName,
    input: input.args,
    entityRef: deriveEntityRef(input.step.actionName, input.args),
    executionContext: buildExecutionContext(input.auth),
    idempotencyKey: `orchestration:${input.orchestrationId}:step:${input.step.sequence}`,
    correlationId: `orchestration:${input.orchestrationId}`,
    approvalGrant: input.approvalGrant,
  });

  try {
    const result = await productionExecutionRuntime.executeAction(request);
    if (result.status !== "SUCCESS" || !result.entityRef) {
      return { kind: "FAILED", error: result.outcome };
    }
    return { kind: "COMPLETED", entityRef: { entityType: result.entityRef.entityType, entityId: result.entityRef.entityId } };
  } catch (error) {
    if (error instanceof Error && error.name === "ApprovalRequiredError") {
      const definition = actionRegistry.hasAction(input.step.actionName) ? actionRegistry.getActionDefinition(input.step.actionName) : null;
      const approvalRequest = await policyEngine.createApprovalRequest({
        actionName: input.step.actionName,
        targetEntityRef: request.entityRef,
        normalizedInputHash: request.normalizedInputHash,
        actorId: input.auth.user.id,
        organizationId: input.auth.organization.id,
        approvalTtlClass: definition?.approvalTtlClass ?? "STANDARD",
        correlationId: `orchestration:${input.orchestrationId}`,
      });
      return { kind: "AWAITING_APPROVAL", approvalRequestId: approvalRequest.approvalId };
    }
    return { kind: "FAILED", error: error instanceof Error ? error.message : "Unknown error." };
  }
}

function resolveStepArgs(
  template: OrchestrationStepArgs,
  priorResults: readonly (OrchestrationStepResult | null)[],
): Record<string, unknown> | null {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (isStepReference(value)) {
      const prior = priorResults[value.$stepRef];
      if (!prior) return null;
      resolved[key] = prior.entityId;
      continue;
    }
    resolved[key] = value;
  }
  return resolved;
}

function deriveEntityRef(actionName: string, args: Record<string, unknown>): { entityType: string; entityId: string } | undefined {
  const action = CATALOG_BY_NAME.get(actionName);
  if (!action) return undefined;
  const refField = action.fields.find((field) => field.isEntityReference && typeof args[field.name] === "string");
  if (!refField) return undefined;
  const domain = ENTITY_REFERENCE_FIELDS[refField.name];
  return domain ? { entityType: domain, entityId: args[refField.name] as string } : undefined;
}

export async function getOrchestrationById(id: string, organizationId: string): Promise<OrchestrationView | null> {
  const orchestration = await prisma.executiveOrchestration.findFirst({
    where: { id, organizationId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
  return orchestration ? toView(orchestration) : null;
}

type OrchestrationWithSteps = Prisma.ExecutiveOrchestrationGetPayload<{ include: { steps: true } }>;

function toView(orchestration: OrchestrationWithSteps): OrchestrationView {
  return {
    id: orchestration.id,
    status: orchestration.status,
    triggerUtterance: orchestration.triggerUtterance,
    steps: orchestration.steps
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((step) => ({
        id: step.id,
        sequence: step.sequence,
        domain: step.domain,
        actionName: step.actionName,
        status: step.status,
        approvalRequestId: step.approvalRequestId,
        resultEntityType: step.resultEntityType,
        resultEntityId: step.resultEntityId,
        errorMessage: step.errorMessage,
      })),
  };
}
