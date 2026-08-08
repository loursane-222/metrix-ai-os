import { ApiValidationError } from "@/lib/api/validation";

import { completeTaskRecord, countTaskSummary, createTask, listTasksForOrganization } from "./task.repository";

import type { CreateTaskInput, ListTasksInput, TaskResult, TaskSummary } from "./task.types";

export async function createNewTask(input: CreateTaskInput): Promise<TaskResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.title, "title");

  return createTask(input);
}

export async function listTasks(input: ListTasksInput): Promise<TaskResult[]> {
  assertNonEmpty(input.organizationId, "organizationId");
  return listTasksForOrganization(input);
}

/** Reporting integration point: exposes aggregate task state for the executive reporting engine to consume. */
export async function getTaskSummary(organizationId: string): Promise<TaskSummary> {
  assertNonEmpty(organizationId, "organizationId");
  return countTaskSummary(organizationId);
}

export async function completeTask(organizationId: string, taskId: string): Promise<TaskResult | null> {
  assertNonEmpty(organizationId, "organizationId");
  assertNonEmpty(taskId, "taskId");
  return completeTaskRecord(organizationId, taskId);
}

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (!value || value.trim().length === 0) {
    throw new ApiValidationError(`${field} is required.`);
  }
}
