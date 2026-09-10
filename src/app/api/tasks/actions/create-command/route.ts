import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, isRecord, readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { authFail } from "@/lib/auth/guards/api-auth-guard";
import { resolveTaskCreatePlan, type TaskCreatePendingContext } from "@/lib/tasks/task-create-conversation-planner";
import { generateTaskCreatePlanText } from "@/lib/tasks/task-create-conversation-ai-adapter";
import type { TaskCreatePlan } from "@/lib/tasks/task-create-conversation-plan";
import { resolveRepByName } from "@/lib/core/organization-members/member-name-resolution";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";

// Task creation's assignee resolution reuses the SAME canonical member/self
// resolver every manager-decision flow already uses (resolveRepByName) —
// see "Member / Assignee Authority" in the task-create regression repair
// notes. The planner only ever emits a semantic assigneeReference ("SELF"
// or a name); this is the single place that turns it into the real
// task.assigneeUserId. No second identity-resolution authority.
async function resolveAssignee(plan: TaskCreatePlan, authContext: AuthContext): Promise<TaskCreatePlan> {
  if (plan.kind !== "CREATE_PLAN" || !plan.assigneeReference) return plan;
  // "SELF" is the planner's own explicit semantic token (see the system
  // prompt in task-create-conversation-planner.ts) — already classified,
  // not raw utterance text, so it resolves directly rather than through
  // resolveRepByName's Turkish self-word text match (isSelfReference), which
  // is for free-text name references like "kendim" and would not recognize
  // this token.
  if (plan.assigneeReference === "SELF") {
    return { ...plan, fields: { ...plan.fields, assigneeUserId: authContext.user.id } };
  }
  const resolution = await resolveRepByName(authContext, plan.assigneeReference);
  if (resolution.status === "RESOLVED") {
    return { ...plan, fields: { ...plan.fields, assigneeUserId: resolution.userId } };
  }
  if (resolution.status === "REP_AMBIGUOUS") {
    return { kind: "CLARIFICATION_REQUIRED", reason: `"${plan.assigneeReference}" birden fazla kişiyle eşleşiyor: ${resolution.options.join(", ")}. Hangisi?` };
  }
  return { kind: "CLARIFICATION_REQUIRED", reason: `"${plan.assigneeReference}" adında aktif bir ekip üyesi bulamadım. Görevi kime atayayım?` };
}

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
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const utterance = requiredString(body, "utterance");
    const pendingContext = readPendingContext(body);

    const plan = await resolveTaskCreatePlan({ utterance, pendingContext, generateText: generateTaskCreatePlanText });
    return ok({ plan: await resolveAssignee(plan, authContext) });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, error.status);
    }
    return authFail(error);
  }
}
