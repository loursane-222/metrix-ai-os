import type { Task, TaskPriority, TaskStatus } from "@prisma/client";

export type TaskResult = Task;

export type CreateTaskInput = {
  organizationId: string;
  title: string;
  description?: string;
  dueDate?: Date;
  priority?: TaskPriority;
  assigneeUserId?: string;
  createdByUserId?: string;
};

export type ListTasksInput = {
  organizationId: string;
  status?: TaskStatus;
};

export type TaskSummary = {
  openCount: number;
  overdueCount: number;
  doneCount: number;
};
