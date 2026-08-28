import { createNewWorkCenter } from "@/lib/core/production/production.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleWorkCenterCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const name = requiredString(envelope.input.name, "name");
  const code = requiredString(envelope.input.code, "code");

  // CRITICAL side effect — its failure is the handler's failure.
  const workCenter = await createNewWorkCenter({
    organizationId: envelope.executionContext.organizationId,
    name,
    code,
    notes: optionalString(envelope.input.notes),
  });
  if (!workCenter) throw new Error("Work center creation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "work_center.created", title: "Yeni iş merkezi oluşturuldu", body: workCenter.name, entityType: "WorkCenter", entityId: workCenter.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "work_center", entityId: workCenter.id },
    resultSummary: "Work center created.",
    metadata: { workCenterId: workCenter.id },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
