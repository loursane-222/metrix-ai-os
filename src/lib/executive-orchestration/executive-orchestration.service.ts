import { prisma } from "@/lib/core/shared/prisma";
import { productionExecutionRuntime } from "@/lib/action-runtime/composition/production-execution-runtime";
import { buildActionExecutionRequest } from "@/lib/action-runtime/gateway/execution-request";
import { buildExecutionContext } from "@/lib/action-runtime/gateway/execution-context";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type {
  OrchestrationPlan,
  OrchestrationRunContext,
  OrchestrationStepResult,
  OrchestrationView,
} from "./executive-orchestration.types";

// Sequential runtime — see executive-orchestration.types.ts for what's
// deliberately out of v1 scope. A failed step halts the chain: every
// remaining step is marked SKIPPED rather than attempted, and earlier
// already-completed steps are left as-is (no compensation/rollback yet).
export async function runOrchestration(input: {
  auth: AuthContext;
  triggerUtterance: string;
  plan: OrchestrationPlan;
}): Promise<OrchestrationView> {
  const organizationId = input.auth.organization.id;

  const orchestration = await prisma.executiveOrchestration.create({
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
        })),
      },
    },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });

  const priorResults: (OrchestrationStepResult | null)[] = [];
  let anyFailed = false;
  let anySucceeded = false;

  for (const [index, step] of orchestration.steps.entries()) {
    const stepPlan = input.plan.steps[index]!;

    if (anyFailed) {
      await prisma.orchestrationStep.updateMany({ where: { id: step.id, organizationId }, data: { status: "SKIPPED" } });
      priorResults.push(null);
      continue;
    }

    await prisma.orchestrationStep.updateMany({ where: { id: step.id, organizationId }, data: { status: "RUNNING", startedAt: new Date() } });

    try {
      const context: OrchestrationRunContext = { organizationId, actorUserId: input.auth.user.id, priorResults };
      const actionInput = stepPlan.buildInput(context);
      const result = await productionExecutionRuntime.executeAction(
        buildActionExecutionRequest({
          actionName: stepPlan.actionName,
          input: actionInput,
          executionContext: buildExecutionContext(input.auth),
          idempotencyKey: `orchestration:${orchestration.id}:step:${step.sequence}`,
          correlationId: `orchestration:${orchestration.id}`,
        }),
      );

      if (result.status !== "SUCCESS" || !result.entityRef) {
        await prisma.orchestrationStep.updateMany({
          where: { id: step.id, organizationId },
          data: { status: "FAILED", errorMessage: result.outcome, completedAt: new Date() },
        });
        anyFailed = true;
        priorResults.push(null);
        continue;
      }

      await prisma.orchestrationStep.updateMany({
        where: { id: step.id, organizationId },
        data: {
          status: "COMPLETED",
          resultEntityType: result.entityRef.entityType,
          resultEntityId: result.entityRef.entityId,
          completedAt: new Date(),
        },
      });
      anySucceeded = true;
      priorResults.push({ entityType: result.entityRef.entityType, entityId: result.entityRef.entityId });
    } catch (error) {
      await prisma.orchestrationStep.updateMany({
        where: { id: step.id, organizationId },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown error.",
          completedAt: new Date(),
        },
      });
      anyFailed = true;
      priorResults.push(null);
    }
  }

  const finalStatus = anyFailed ? (anySucceeded ? "PARTIALLY_COMPLETED" : "FAILED") : "COMPLETED";
  await prisma.executiveOrchestration.updateMany({
    where: { id: orchestration.id, organizationId },
    data: { status: finalStatus, completedAt: new Date() },
  });
  const finalOrchestration = await prisma.executiveOrchestration.findFirstOrThrow({
    where: { id: orchestration.id, organizationId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });

  return {
    id: finalOrchestration.id,
    status: finalOrchestration.status,
    triggerUtterance: finalOrchestration.triggerUtterance,
    steps: finalOrchestration.steps.map((step) => ({
      id: step.id,
      sequence: step.sequence,
      domain: step.domain,
      actionName: step.actionName,
      status: step.status,
      resultEntityType: step.resultEntityType,
      resultEntityId: step.resultEntityId,
      errorMessage: step.errorMessage,
    })),
  };
}

export async function getOrchestrationById(id: string, organizationId: string): Promise<OrchestrationView | null> {
  const orchestration = await prisma.executiveOrchestration.findFirst({
    where: { id, organizationId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
  if (!orchestration) return null;
  return {
    id: orchestration.id,
    status: orchestration.status,
    triggerUtterance: orchestration.triggerUtterance,
    steps: orchestration.steps.map((step) => ({
      id: step.id,
      sequence: step.sequence,
      domain: step.domain,
      actionName: step.actionName,
      status: step.status,
      resultEntityType: step.resultEntityType,
      resultEntityId: step.resultEntityId,
      errorMessage: step.errorMessage,
    })),
  };
}
