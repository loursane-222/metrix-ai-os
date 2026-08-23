import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { buildActionCatalog, renderActionCatalogForPrompt, type CatalogAction } from "./action-catalog";
import { resolveEntityReference, ENTITY_REFERENCE_FIELDS } from "./entity-resolvers";
import type { OrchestrationPlan, OrchestrationStepPlan } from "./executive-orchestration.types";
import type { GenerateOrchestrationPlanText } from "./orchestration-plan-ai-adapter";

export type GeneralPlanResolveOutcome =
  | Readonly<{ status: "PLAN_READY"; plan: OrchestrationPlan; summary: string }>
  | Readonly<{ status: "NOT_HANDLED" }>
  | Readonly<{ status: "CLARIFICATION_REQUIRED" }>;

// A prior-step reference: the model writes "$step1" for a field whose real
// value is the entity that an earlier step in the SAME plan will create
// (e.g. step 2's orderId should be the order step 1 just created). This
// can't be resolved against real data yet — it doesn't exist — so it's
// substituted from OrchestrationRunContext.priorResults at execution time
// instead (see buildStepInput below).
const STEP_REFERENCE = /^\$step(\d+)$/u;

function buildSystemPrompt(catalog: readonly CatalogAction[]): string {
  return [
    "Sen METRIX'te kullanıcının TEK bir mesajından, birden fazla adımlı bir iş komutunu (orkestrasyon) çıkaran bir planlayıcısın.",
    "Kullanıcı bir cümlede birden fazla iş yapmak isteyebilir (örn. \"X için sipariş oluştur, sonra irsaliyesini kes\") — bunları AŞAĞIDAKİ listede olan aksiyonlardan sıralı bir plana dönüştür.",
    "Yalnızca aşağıdaki şemalardan TEK bir JSON nesnesi üret; açıklama, markdown veya kod bloğu ekleme.",
    "",
    "KULLANILABİLİR AKSİYONLAR:",
    renderActionCatalogForPrompt(catalog),
    "",
    "ÇIKTI ŞEMALARI:",
    '{"result":"plan","steps":[{"action":"<yukarıdaki listeden bir aksiyon adı>","args":{"<alan>":"<değer>"}}, ...]}',
    '{"result":"unsupported"}',
    '{"result":"clarification_required"}',
    "",
    "KURALLAR:",
    "- Mesaj yukarıdaki aksiyonlarla gerçekleştirilebilecek, en az bir iş-yapma niyeti taşımıyorsa (soru sormak, sohbet etmek, listelemek vb.) unsupported dön.",
    "- 'gerçek bir ada/numaraya karşılık gelmeli' diye işaretli alanlara ASLA id uydurma — yalnızca kullanıcının mesajında geçen düz metin ismi/numarayı yaz; bu alan ayrıca doğrulanacak.",
    "- Bir adımın girdisi, planın DAHA ÖNCEKİ bir adımının oluşturacağı kayıtsa (örn. az önce oluşturulan siparişin irsaliyesi), o alana tam olarak \"$step1\", \"$step2\" gibi bir referans yaz (1-tabanlı adım sırası) — gerçek bir isim yazma.",
    "- Zorunlu bir alan için mesajda hiç bilgi yoksa ve makul bir varsayılan üretilemiyorsa (örn. tutar/miktar gibi kritik bir sayı) clarification_required dön; tahmini sayı uydurma.",
    "- Yalnızca yukarıdaki listede olan aksiyon adlarını kullan; listede olmayan bir işlem isteniyorsa unsupported dön.",
  ].join("\n");
}

export async function resolveGeneralOrchestrationPlan(input: {
  utterance: string;
  auth: AuthContext;
  generateText: GenerateOrchestrationPlanText;
}): Promise<GeneralPlanResolveOutcome> {
  const catalog = buildActionCatalog();
  const catalogByName = new Map(catalog.map((action) => [action.actionName, action]));
  const systemPrompt = buildSystemPrompt(catalog);

  const raw = await input.generateText({ systemPrompt, userMessage: input.utterance });
  const parsed = parseJsonSafely(raw);
  if (!parsed || typeof parsed !== "object") return { status: "NOT_HANDLED" };

  const record = parsed as Record<string, unknown>;
  if (record.result === "unsupported") return { status: "NOT_HANDLED" };
  if (record.result === "clarification_required") return { status: "CLARIFICATION_REQUIRED" };
  if (record.result !== "plan" || !Array.isArray(record.steps) || record.steps.length === 0) {
    return { status: "NOT_HANDLED" };
  }

  const organizationId = input.auth.organization.id;
  const resolvedSteps: OrchestrationStepPlan[] = [];

  for (const rawStep of record.steps) {
    if (typeof rawStep !== "object" || rawStep === null) return { status: "CLARIFICATION_REQUIRED" };
    const stepRecord = rawStep as Record<string, unknown>;
    const actionName = typeof stepRecord.action === "string" ? stepRecord.action : "";
    const action = catalogByName.get(actionName);
    if (!action) return { status: "CLARIFICATION_REQUIRED" };
    const args = isRecord(stepRecord.args) ? stepRecord.args : {};

    // Pre-resolve every entity-reference field that is NOT a same-plan
    // step reference — fail closed (ask for clarification) rather than
    // execute any step on an ambiguous or invented reference. A same-plan
    // reference becomes a plain, JSON-serializable {$stepRef} sentinel
    // (see executive-orchestration.types.ts) instead of a closure, so the
    // whole template can be persisted and read back to resume execution
    // after an approval-gated step pauses the chain in a later turn.
    const argsTemplate: Record<string, unknown> = {};

    for (const field of action.fields) {
      const value = args[field.name];
      if (value === undefined || value === null || value === "") {
        if (field.required) return { status: "CLARIFICATION_REQUIRED" };
        continue;
      }
      if (field.isEntityReference && typeof value === "string") {
        const stepReferenceMatch = STEP_REFERENCE.exec(value.trim());
        if (stepReferenceMatch) {
          const referencedStepIndex = Number(stepReferenceMatch[1]) - 1;
          if (referencedStepIndex < 0 || referencedStepIndex >= resolvedSteps.length) return { status: "CLARIFICATION_REQUIRED" };
          argsTemplate[field.name] = { $stepRef: referencedStepIndex };
          continue;
        }
        const resolution = await resolveEntityReference(ENTITY_REFERENCE_FIELDS[field.name]!, organizationId, value);
        if (resolution.status !== "RESOLVED") return { status: "CLARIFICATION_REQUIRED" };
        argsTemplate[field.name] = resolution.id;
        continue;
      }
      argsTemplate[field.name] = value;
    }

    resolvedSteps.push({
      domain: action.actionName.split(".")[0]!,
      actionName: action.actionName,
      argsTemplate,
    });
  }

  if (resolvedSteps.length === 0) return { status: "NOT_HANDLED" };

  return {
    status: "PLAN_READY",
    plan: { steps: resolvedSteps },
    summary: `${resolvedSteps.length} adımlı bir işlem: ${resolvedSteps.map((step) => step.actionName).join(" → ")}.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text.trim().replace(/^```json\n?|```$/g, ""));
  } catch {
    return null;
  }
}
