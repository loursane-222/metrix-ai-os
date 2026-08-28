import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/shared/prisma";
import { productionExecutionRuntime } from "@/lib/action-runtime/composition/production-execution-runtime";
import { buildActionExecutionRequest } from "@/lib/action-runtime/gateway/execution-request";
import { buildExecutionContext } from "@/lib/action-runtime/gateway/execution-context";
import { actionRegistry } from "@/lib/action-runtime/registry";
import { policyEngine } from "@/lib/action-runtime/policy";
import type { ApprovalGrant } from "@/lib/action-runtime/policy";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { buildActionCatalog } from "./action-catalog";
import { deriveCompensationCalls } from "./compensation";
import { ENTITY_REFERENCE_FIELDS } from "./entity-resolvers";
import { validatePlanIrreversibleOrdering } from "./plan-validation";
import { isStepReference } from "./executive-orchestration.types";
import { computeExecutionWaves } from "./orchestration-waves";
import type {
  OrchestrationPlan,
  OrchestrationStepArgs,
  OrchestrationStepResult,
  OrchestrationView,
} from "./executive-orchestration.types";

type OrchestrationStepRow = Prisma.ExecutiveOrchestrationGetPayload<{ include: { steps: true } }>["steps"][number];

const CATALOG_BY_NAME = new Map(buildActionCatalog().map((action) => [action.actionName, action]));

// Wave-parallel runtime. computeExecutionWaves groups steps by dependency
// depth (derived from $stepRef references in each step's argsTemplate) —
// steps with no dependency relationship to each other land in the same
// wave and execute concurrently via Promise.all; a step only ever waits on
// the specific wave(s) its own $stepRef references depend on, never on
// unrelated siblings. A step that fails halts every LATER wave (marked
// SKIPPED) — but its own wave-mates, already in flight together, still run
// to completion; nothing already committed to running is aborted
// mid-wave. A step requiring EXPLICIT approval pauses the whole
// orchestration in AWAITING_APPROVAL once its wave finishes — same-wave
// siblings that already succeeded stay COMPLETED, not discarded;
// resumeOrchestration() grants it and continues from that wave in a later
// turn. See executive-orchestration.types.ts for what's still out of
// scope (exception/recovery intelligence beyond one clean compensation
// attempt, learning intelligence).
export async function runOrchestration(input: {
  auth: AuthContext;
  triggerUtterance: string;
  plan: OrchestrationPlan;
}): Promise<OrchestrationView> {
  const organizationId = input.auth.organization.id;

  // Defense in depth: resolveGeneralOrchestrationPlan already rejects an
  // invalid plan before it ever reaches here (see general-plan-resolver.ts).
  // This guard exists so a future second plan-producer can't bypass that
  // guarantee — should be unreachable in practice.
  const validation = validatePlanIrreversibleOrdering(input.plan);
  if (!validation.valid) throw new Error(validation.reason);

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

  const awaitingStep = orchestration.steps.find((step) => step.status === "AWAITING_APPROVAL" || step.status === "COMPENSATION_AWAITING_APPROVAL");
  if (!awaitingStep?.approvalRequestId) return null;
  const isCompensationResume = awaitingStep.status === "COMPENSATION_AWAITING_APPROVAL";

  let grant: ApprovalGrant;
  try {
    grant = await policyEngine.grantApproval(awaitingStep.approvalRequestId, input.auth.user.id);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Onay verilemedi.";
    if (isCompensationResume) {
      await prisma.orchestrationStep.updateMany({ where: { id: awaitingStep.id, organizationId }, data: { status: "COMPENSATION_FAILED", errorMessage } });
      await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "COMPENSATION_FAILED", completedAt: new Date() } });
      return getOrchestrationById(orchestration.id, organizationId);
    }
    await prisma.orchestrationStep.updateMany({
      where: { id: awaitingStep.id, organizationId },
      data: { status: "FAILED", errorMessage, completedAt: new Date() },
    });
    return finalizeFailedForwardRun({ auth: input.auth, orchestrationId: orchestration.id });
  }

  if (isCompensationResume) {
    await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "COMPENSATING" } });
    return runCompensationPass({ auth: input.auth, orchestrationId: orchestration.id, resumeApproval: { stepId: awaitingStep.id, grant } });
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

  const stepsBySequence = new Map(orchestration.steps.map((step) => [step.sequence, step]));
  const waves = computeExecutionWaves(orchestration.steps.map((step) => ({ sequence: step.sequence, input: (step.input ?? {}) as OrchestrationStepArgs })));

  for (const wave of waves) {
    const pendingInWave = wave
      .map((sequence) => stepsBySequence.get(sequence)!)
      .filter((step) => step.status !== "COMPLETED" && step.status !== "FAILED" && step.status !== "SKIPPED");
    if (pendingInWave.length === 0) continue;

    if (anyFailed) {
      await Promise.all(pendingInWave.map((step) =>
        prisma.orchestrationStep.updateMany({ where: { id: step.id, organizationId }, data: { status: "SKIPPED" } }),
      ));
      continue;
    }

    // A step whose $stepRef points at a result that never materialized
    // (its dependency was skipped or failed in an earlier wave) fails
    // immediately, without being attempted — same "broken reference"
    // handling as before, evaluated once per wave now.
    const runnable: { step: OrchestrationStepRow; args: Record<string, unknown> }[] = [];
    for (const step of pendingInWave) {
      const args = resolveStepArgs((step.input ?? {}) as OrchestrationStepArgs, priorResults);
      if (!args) {
        await prisma.orchestrationStep.updateMany({
          where: { id: step.id, organizationId },
          data: { status: "FAILED", errorMessage: "Referenced an earlier step whose result is not available.", completedAt: new Date() },
        });
        anyFailed = true;
        continue;
      }
      runnable.push({ step, args });
    }
    if (runnable.length === 0) continue;

    await Promise.all(runnable.map(({ step }) =>
      prisma.orchestrationStep.updateMany({ where: { id: step.id, organizationId }, data: { status: "RUNNING", startedAt: new Date() } }),
    ));

    // The whole wave is already committed to running together by this
    // point — outcomes are only inspected after every step in it has
    // settled, never used to cancel a sibling mid-wave.
    const settled = await Promise.all(runnable.map(async ({ step, args }) => {
      const approvalGrant = input.resumeApproval?.stepId === step.id ? input.resumeApproval.grant : undefined;
      const outcome = await executeOneStep({
        auth: input.auth,
        orchestrationId: orchestration.id,
        step: { id: step.id, sequence: step.sequence, actionName: step.actionName },
        args,
        approvalGrant,
      });
      return { step, outcome };
    }));

    let waveAwaitingApproval = false;
    for (const { step, outcome } of settled) {
      if (outcome.kind === "AWAITING_APPROVAL") {
        waveAwaitingApproval = true;
        await prisma.orchestrationStep.updateMany({
          where: { id: step.id, organizationId },
          data: { status: "AWAITING_APPROVAL", approvalRequestId: outcome.approvalRequestId },
        });
        continue;
      }
      if (outcome.kind === "FAILED") {
        anyFailed = true;
        await prisma.orchestrationStep.updateMany({
          where: { id: step.id, organizationId },
          data: { status: "FAILED", errorMessage: outcome.error, completedAt: new Date() },
        });
        continue;
      }
      await prisma.orchestrationStep.updateMany({
        where: { id: step.id, organizationId },
        data: {
          status: "COMPLETED",
          resultEntityType: outcome.entityRef.entityType,
          resultEntityId: outcome.entityRef.entityId,
          completedAt: new Date(),
          compensationSnapshot: (outcome.compensationSnapshot as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
        },
      });
      priorResults[step.sequence - 1] = outcome.entityRef;
    }

    if (waveAwaitingApproval) {
      await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "AWAITING_APPROVAL" } });
      return (await getOrchestrationById(orchestration.id, organizationId))!;
    }
  }

  if (!anyFailed) {
    await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "COMPLETED", completedAt: new Date() } });
    return (await getOrchestrationById(orchestration.id, organizationId))!;
  }
  return finalizeFailedForwardRun({ auth: input.auth, orchestrationId: orchestration.id });
}

// A forward run that hit a failure (a step's own execution, or a denied
// forward approval) is never left ambiguously PARTIALLY_COMPLETED: if
// anything actually completed, it must be reversed (runCompensationPass);
// only a run that never got anywhere lands on plain FAILED.
async function finalizeFailedForwardRun(input: { auth: AuthContext; orchestrationId: string }): Promise<OrchestrationView> {
  const organizationId = input.auth.organization.id;
  const orchestration = await prisma.executiveOrchestration.findFirstOrThrow({
    where: { id: input.orchestrationId, organizationId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
  const anySucceeded = orchestration.steps.some((step) => step.status === "COMPLETED");
  if (!anySucceeded) {
    await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "FAILED", completedAt: new Date() } });
    return (await getOrchestrationById(orchestration.id, organizationId))!;
  }
  await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "COMPENSATING" } });
  return runCompensationPass({ auth: input.auth, orchestrationId: orchestration.id });
}

type StepCompensationOutcome =
  | Readonly<{ kind: "COMPENSATED" }>
  | Readonly<{ kind: "AWAITING_APPROVAL"; approvalRequestId: string }>
  | Readonly<{ kind: "FAILED"; error: string }>;

// One step's full compensation, however many calls it takes (stock.transfer
// needs two) — always sequential within a step, since its second call may
// depend on the first having actually happened. Multiple steps'
// compensations run concurrently against each other (see runCompensationPass);
// nothing here talks to another step.
async function compensateOneStep(input: {
  auth: AuthContext;
  orchestrationId: string;
  step: OrchestrationStepRow;
  resumeApproval?: { stepId: string; grant: ApprovalGrant };
}): Promise<StepCompensationOutcome> {
  const { step } = input;
  let definition: ReturnType<typeof actionRegistry.getActionDefinition>;
  try {
    definition = actionRegistry.getActionDefinition(step.actionName);
  } catch {
    return { kind: "FAILED", error: "Kayıtlı olmayan bir aksiyon için geri alma denendi." };
  }

  const calls = deriveCompensationCalls(
    {
      actionName: step.actionName,
      resultEntityType: step.resultEntityType,
      resultEntityId: step.resultEntityId,
      compensationSnapshot: (step.compensationSnapshot as Record<string, unknown> | null) ?? null,
    },
    definition,
  );
  if (calls === null) return { kind: "FAILED", error: "Bu aksiyon için tanımlı bir geri alma (compensation) yok." };
  if (calls.length === 0) return { kind: "COMPENSATED" };

  const stepEntityRef = step.resultEntityType && step.resultEntityId ? { entityType: step.resultEntityType, entityId: step.resultEntityId } : undefined;
  for (let callIndex = 0; callIndex < calls.length; callIndex += 1) {
    const call = calls[callIndex]!;
    const approvalGrant = input.resumeApproval?.stepId === step.id ? input.resumeApproval.grant : undefined;
    const outcome = await executeCompensationCall({
      auth: input.auth,
      orchestrationId: input.orchestrationId,
      step: { sequence: step.sequence },
      callIndex,
      call,
      entityRef: stepEntityRef,
      approvalGrant,
    });
    if (outcome.kind === "AWAITING_APPROVAL") return { kind: "AWAITING_APPROVAL", approvalRequestId: outcome.approvalRequestId };
    if (outcome.kind === "FAILED") return { kind: "FAILED", error: outcome.error };
  }
  return { kind: "COMPENSATED" };
}

// Walks waves in reverse (the same dependency layering forward execution
// used — undo the last wave first, so a delivery is reversed before the
// order it references) and, within each wave, compensates every step
// concurrently — mirroring forward execution's "same wave, already
// committed to running together" rule. One clean attempt per step: a
// compensation failure anywhere in a wave stops the pass after that wave
// finishes settling (earlier, un-touched waves are never attempted) and is
// surfaced loudly as COMPENSATION_FAILED, never retried or silently
// absorbed — see compensation.ts's deriveCompensationCalls.
async function runCompensationPass(input: {
  auth: AuthContext;
  orchestrationId: string;
  resumeApproval?: { stepId: string; grant: ApprovalGrant };
}): Promise<OrchestrationView> {
  const organizationId = input.auth.organization.id;
  const orchestration = await prisma.executiveOrchestration.findFirstOrThrow({
    where: { id: input.orchestrationId, organizationId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });

  const stepsBySequence = new Map(orchestration.steps.map((step) => [step.sequence, step]));
  const waves = computeExecutionWaves(orchestration.steps.map((step) => ({ sequence: step.sequence, input: (step.input ?? {}) as OrchestrationStepArgs })));
  const wavesDescending = [...waves].reverse();

  for (const wave of wavesDescending) {
    const toCompensate = wave
      .map((sequence) => stepsBySequence.get(sequence)!)
      .filter((step) => step.status === "COMPLETED" || step.status === "COMPENSATION_AWAITING_APPROVAL");
    if (toCompensate.length === 0) continue;

    await Promise.all(toCompensate.map((step) =>
      prisma.orchestrationStep.updateMany({ where: { id: step.id, organizationId }, data: { status: "COMPENSATING" } }),
    ));

    const settled = await Promise.all(toCompensate.map(async (step) => ({
      step,
      outcome: await compensateOneStep({ auth: input.auth, orchestrationId: orchestration.id, step, resumeApproval: input.resumeApproval }),
    })));

    let waveFailed = false;
    let waveAwaitingApproval = false;
    for (const { step, outcome } of settled) {
      if (outcome.kind === "COMPENSATED") {
        await prisma.orchestrationStep.updateMany({ where: { id: step.id, organizationId }, data: { status: "COMPENSATED", compensatedAt: new Date() } });
      } else if (outcome.kind === "AWAITING_APPROVAL") {
        waveAwaitingApproval = true;
        await prisma.orchestrationStep.updateMany({
          where: { id: step.id, organizationId },
          data: { status: "COMPENSATION_AWAITING_APPROVAL", approvalRequestId: outcome.approvalRequestId },
        });
      } else {
        waveFailed = true;
        await prisma.orchestrationStep.updateMany({ where: { id: step.id, organizationId }, data: { status: "COMPENSATION_FAILED", errorMessage: outcome.error } });
      }
    }

    // A hard failure is the more severe, more blocking outcome — reported
    // even if a sibling in the same wave is separately sitting in
    // COMPENSATION_AWAITING_APPROVAL (that step's own row still holds its
    // real state; only the orchestration-level status prioritizes the
    // failure).
    if (waveFailed) {
      await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "COMPENSATION_FAILED", completedAt: new Date() } });
      return (await getOrchestrationById(orchestration.id, organizationId))!;
    }
    if (waveAwaitingApproval) {
      await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "AWAITING_APPROVAL" } });
      return (await getOrchestrationById(orchestration.id, organizationId))!;
    }
  }

  await prisma.executiveOrchestration.updateMany({ where: { id: orchestration.id, organizationId }, data: { status: "COMPENSATED", completedAt: new Date() } });
  return (await getOrchestrationById(orchestration.id, organizationId))!;
}

type StepExecutionOutcome =
  | Readonly<{ kind: "COMPLETED"; entityRef: OrchestrationStepResult; compensationSnapshot: Record<string, unknown> | null }>
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
    return {
      kind: "COMPLETED",
      entityRef: { entityType: result.entityRef.entityType, entityId: result.entityRef.entityId },
      // NO_CHANGE means this step's handler found (didn't create/mutate)
      // an already-existing record — e.g. product.create's dedup-by-name
      // match, or an UPDATE with an empty effective patch. Compensating
      // that would wrongly archive/revert a record this orchestration
      // never actually touched. Overrides whatever the handler put in
      // compensationSnapshot — NO_CHANGE is authoritative regardless.
      compensationSnapshot: result.outcome === "NO_CHANGE" ? { skipCompensation: true } : (result.compensationSnapshot ?? null),
    };
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

// Same execution path executeOneStep uses, but with an idempotency
// key/correlationId namespaced under ":compensation:" so the audit trail is
// visibly distinct from the forward run. entityRef is reused from the
// forward step's own resolved entity (the compensator always targets the
// same record the forward step acted on) rather than re-derived from the
// compensator's own catalog entry — several compensators (machine.archive,
// payment.void, ...) are deliberately excluded from the forward planner's
// catalog (see action-catalog.ts's EXCLUDED_ACTION_NAMES) and would have no
// catalog entry to derive from.
async function executeCompensationCall(input: {
  auth: AuthContext;
  orchestrationId: string;
  step: { sequence: number };
  callIndex: number;
  call: { actionName: string; input: Record<string, unknown> };
  entityRef?: { entityType: string; entityId: string };
  approvalGrant?: ApprovalGrant;
}): Promise<StepExecutionOutcome> {
  const request = buildActionExecutionRequest({
    actionName: input.call.actionName,
    input: input.call.input,
    entityRef: input.entityRef,
    executionContext: buildExecutionContext(input.auth),
    idempotencyKey: `orchestration:${input.orchestrationId}:compensation:step:${input.step.sequence}:${input.callIndex}`,
    correlationId: `orchestration:${input.orchestrationId}:compensation`,
    approvalGrant: input.approvalGrant,
  });

  try {
    const result = await productionExecutionRuntime.executeAction(request);
    if (result.status !== "SUCCESS") {
      return { kind: "FAILED", error: result.outcome };
    }
    return {
      kind: "COMPLETED",
      entityRef: result.entityRef
        ? { entityType: result.entityRef.entityType, entityId: result.entityRef.entityId }
        : (input.entityRef ?? { entityType: "", entityId: "" }),
      compensationSnapshot: null,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "ApprovalRequiredError") {
      const definition = actionRegistry.hasAction(input.call.actionName) ? actionRegistry.getActionDefinition(input.call.actionName) : null;
      const approvalRequest = await policyEngine.createApprovalRequest({
        actionName: input.call.actionName,
        targetEntityRef: request.entityRef,
        normalizedInputHash: request.normalizedInputHash,
        actorId: input.auth.user.id,
        organizationId: input.auth.organization.id,
        approvalTtlClass: definition?.approvalTtlClass ?? "STANDARD",
        correlationId: `orchestration:${input.orchestrationId}:compensation`,
      });
      return { kind: "AWAITING_APPROVAL", approvalRequestId: approvalRequest.approvalId };
    }
    return { kind: "FAILED", error: error instanceof Error ? error.message : "Unknown compensation error." };
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
