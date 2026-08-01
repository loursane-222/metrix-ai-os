import type { DomainEventDescriptor } from "../../events";

export function buildTaskCreatedDomainEvent(taskId: string, createdByActorId: string): DomainEventDescriptor {
  return {
    eventType: "TaskCreated", aggregateType: "task", aggregateId: taskId, schemaVersion: "1",
    payload: { taskId, createdByActorId },
  };
}
