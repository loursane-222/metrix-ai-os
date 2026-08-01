import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, isRecord, readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { authFail } from "@/lib/auth/guards/api-auth-guard";
import { resolveTaskCreatePlan, type TaskCreatePendingContext } from "@/lib/tasks/task-create-conversation-planner";
import { generateTaskCreatePlanText } from "@/lib/tasks/task-create-conversation-ai-adapter";

function readPendingContext(body: Record<string, unknown>): TaskCreatePendingContext {
  const raw = body["pendingContext"];
  if (!isRecord(raw)) return null;
  const lifecycle = raw.lifecycle;
  if (lifecycle !== "OPENING" && lifecycle !== "COLLECTING" && lifecycle !== "READY") return null;
  const fields = isRecord(raw.fields) ? raw.fields : {};
  return { lifecycle, fields: fields as TaskCreatePendingContext extends null ? never : NonNullable<TaskCreatePendingContext>["fields"] };
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const utterance = requiredString(body, "utterance");
    const pendingContext = readPendingContext(body);

    const plan = await resolveTaskCreatePlan({ utterance, pendingContext, generateText: generateTaskCreatePlanText });
    return ok({ plan });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, error.status);
    }
    return authFail(error);
  }
}
