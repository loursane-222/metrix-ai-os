import { fail, ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { findTaskById } from "@/lib/core/tasks/task.service";
import { generateTaskEditCommandText } from "@/lib/tasks/task-edit-command-ai-adapter";
import { resolveTaskEditCommand } from "@/lib/tasks/task-edit-command-resolver";

export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies(); const { taskId } = await context.params;
    const body = await readJsonObject(request); const utterance = requiredString(body, "utterance"); const activeTab = requiredString(body, "activeTab");
    const task = await findTaskById(taskId, auth.organization.id); if (!task) return fail("Task not found.", 404);
    const outcome = await resolveTaskEditCommand({ utterance, activeTab, generateText: generateTaskEditCommandText, context: { title: task.title, status: task.status } });
    return ok({ outcome });
  } catch (error: unknown) { return mapExecutionErrorToHttpResponse(error); }
}
