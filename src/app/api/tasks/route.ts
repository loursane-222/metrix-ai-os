import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { listTasks } from "@/lib/core/tasks";
import type { TaskStatus } from "@prisma/client";

const TASK_STATUSES = ["OPEN", "DONE", "CANCELLED"] as const satisfies readonly TaskStatus[];

export async function GET(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const rawStatus = new URL(request.url).searchParams.get("status") ?? undefined;

    if (rawStatus !== undefined && !(TASK_STATUSES as readonly string[]).includes(rawStatus)) {
      return fail("status is invalid.", 400);
    }

    const tasks = await listTasks({
      organizationId: authContext.organization.id,
      status: rawStatus as TaskStatus | undefined,
    });

    return ok({ tasks, count: tasks.length });
  } catch (error: unknown) {
    return authFail(error);
  }
}
