import { fail, ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { resolveGeneralOrchestrationPlan } from "@/lib/executive-orchestration/general-plan-resolver";
import { generateOrchestrationPlanText } from "@/lib/executive-orchestration/orchestration-plan-ai-adapter";
import { runOrchestration } from "@/lib/executive-orchestration/executive-orchestration.service";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const utterance = requiredString(body, "utterance");

    const resolution = await resolveGeneralOrchestrationPlan({ utterance, auth, generateText: generateOrchestrationPlanText });

    if (resolution.status === "NOT_HANDLED") return ok({ outcome: { status: "NOT_HANDLED" } });
    if (resolution.status === "CLARIFICATION_REQUIRED") return ok({ outcome: { status: "CLARIFICATION_REQUIRED" } });
    if (resolution.status === "PLAN_INVALID") return ok({ outcome: { status: "PLAN_INVALID", reason: resolution.reason } });

    const orchestration = await runOrchestration({ auth, triggerUtterance: utterance, plan: resolution.plan });
    return ok({ outcome: { status: "RUN_COMPLETE", summary: resolution.summary, orchestration } });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[orchestration_plan_and_run] failed", { errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return fail("Orkestrasyon çalıştırılamadı.", 500);
  }
}
