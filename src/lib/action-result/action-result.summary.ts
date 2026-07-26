import type { ActionResultV1 } from "./action-result.contracts";

export type ActionResultSafeSummaryV1 = Readonly<{
  actionName: string;
  status: ActionResultV1["status"];
  targetType: string | null;
  changedFieldCount: number;
  approvalRequired: boolean;
  failureCode: string | null;
  sideEffectCount: number;
}>;

export function summarizeActionResultV1(
  result: ActionResultV1,
): ActionResultSafeSummaryV1 {
  return Object.freeze({
    actionName: result.actionName,
    status: result.status,
    targetType: result.target.entityType,
    changedFieldCount: result.mutation.changedFields.length,
    approvalRequired: result.authorization.approvalRequired,
    failureCode: result.failure.code,
    sideEffectCount: result.sideEffects.length,
  });
}
