import { createNewMachine } from "@/lib/core/production/production.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleMachineCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const workCenterId = requiredString(envelope.input.workCenterId, "workCenterId");
  const name = requiredString(envelope.input.name, "name");
  const code = requiredString(envelope.input.code, "code");

  // CRITICAL side effect — its failure is the handler's failure.
  const machine = await createNewMachine({
    organizationId: envelope.executionContext.organizationId,
    workCenterId,
    name,
    code,
    notes: optionalString(envelope.input.notes),
  });
  if (!machine) throw new Error("Machine creation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "machine.created", title: "Yeni makine eklendi", body: machine.name, entityType: "Machine", entityId: machine.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "machine", entityId: machine.id },
    resultSummary: "Machine created.",
    metadata: { machineId: machine.id },
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
