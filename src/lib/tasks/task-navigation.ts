export type TaskNavigationDescriptor =
  | { kind: "tasks.list" }
  | { kind: "task.create" };

export function buildTaskRoute(descriptor: TaskNavigationDescriptor): string {
  if (descriptor.kind === "task.create") return "/metrix/tasks/new";
  return "/metrix/tasks";
}
