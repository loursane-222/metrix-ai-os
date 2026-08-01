export type TaskContextItem = {
  id: string;
  title: string;
  status: "OPEN" | "DONE" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  assigneeUserId: string | null;
};

export type TaskAssigneeCount = { assigneeUserId: string | null; count: number };

export type TaskContext = {
  openCount: number;
  overdueCount: number;
  dueTodayCount: number;
  completedCount: number;
  priorityBreakdown: { LOW: number; MEDIUM: number; HIGH: number };
  assigneeDistribution: TaskAssigneeCount[];
  openItems: TaskContextItem[];
};
