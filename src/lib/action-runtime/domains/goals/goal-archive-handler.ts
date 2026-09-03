import { archiveSalesGoalById, getSalesGoalByIdForOrganization } from "@/lib/core/goals/goal.service";
import type { ActionHandler } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

/**
 * goal.archive için Domain Action handler'ı. Mevcut archiveSalesGoalById
 * service'ini sarar — POST /api/goals/[goalId]/archive ile aynı davranış.
 */
export const goalArchiveHandler: ActionHandler = async (envelope) => {
  const goalId = requiredString(envelope.input.goalId, "goalId");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await getSalesGoalByIdForOrganization(goalId, organizationId);
  if (!existing) throw new Error("Goal not found.");
  if (existing.status === "CANCELLED") {
    return { status: "SUCCESS", entityRef: { entityType: "goal", entityId: goalId }, resultOutcome: "NO_CHANGE", metadata: { goalId }, domainEvents: [], sideEffects: [] };
  }
  await archiveSalesGoalById(goalId, organizationId);
  return {
    status: "SUCCESS",
    entityRef: { entityType: "goal", entityId: goalId },
    resultSummary: "goal.archive completed.",
    metadata: { goalId },
    domainEvents: [],
    sideEffects: [],
  };
};
