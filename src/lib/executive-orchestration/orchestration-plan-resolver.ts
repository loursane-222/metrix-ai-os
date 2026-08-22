import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { OrchestrationPlan } from "./executive-orchestration.types";
import type { GenerateOrchestrationPlanText } from "./orchestration-plan-ai-adapter";

export type OrchestrationPlanResolveOutcome =
  | { status: "PLAN_READY"; plan: OrchestrationPlan; summary: string }
  | { status: "NOT_HANDLED" }
  | { status: "CLARIFICATION_REQUIRED"; message: string };

// v1 supports exactly ONE multi-domain pattern — see
// executive-orchestration.types.ts for why. A narrow JSON classifier
// (same convention as order-edit-command-resolver.ts) extracts the raw
// slots; the customer name is then resolved deterministically against the
// real customer list (never trusted from the model directly — same
// safeguard as the import wizards' resolveCustomerReference usage).
const SYSTEM_PROMPT = [
  "Sen METRIX'te tek bir kullanıcı cümlesinden çok-adımlı bir yönetim işlemi (orkestrasyon) çıkaran dar bir JSON sınıflandırıcısısın.",
  "Yalnızca aşağıdaki şemalardan TEK bir JSON nesnesi üret; açıklama, markdown veya kod bloğu ekleme.",
  "Şu an desteklenen TEK örüntü: bir müşteri için teklif hazırlamak VE o müşteriyi aramak için birkaç gün sonrasına bir görev açmak.",
  '{"result":"quote_and_followup_task","customerNameRaw":"<mesajda geçen müşteri/firma adı>","quoteTitle":"<teklif başlığı, verilmemişse kısa ve mantıklı bir başlık üret>","quoteAmount":<pozitif sayı, TL cinsinden tutar>,"quoteCurrency":"<TRY|USD|EUR, verilmemişse TRY>","taskDueInDays":<pozitif tam sayı, kaç gün sonra aranacağı, verilmemişse 2>}',
  '{"result":"unsupported"}',
  '{"result":"clarification_required","message":"<kısa Türkçe soru, örn. tutar belirtilmemişse tutarı sor>"}',
  "Mesaj hem teklif hazırlama hem de takip görevi açma niyeti taşımıyorsa unsupported dön.",
  "Müşteri adı veya tutar belirsizse/yoksa clarification_required dön, uydurma.",
].join("\n");

export async function resolveOrchestrationPlan(input: {
  utterance: string;
  auth: AuthContext;
  generateText: GenerateOrchestrationPlanText;
}): Promise<OrchestrationPlanResolveOutcome> {
  const raw = await input.generateText({ systemPrompt: SYSTEM_PROMPT, userMessage: input.utterance });
  const parsed = parseJsonSafely(raw);
  if (!parsed || typeof parsed !== "object") return { status: "NOT_HANDLED" };

  const record = parsed as Record<string, unknown>;
  if (record.result === "unsupported") return { status: "NOT_HANDLED" };
  if (record.result === "clarification_required") {
    const message = record.message;
    return {
      status: "CLARIFICATION_REQUIRED",
      message: typeof message === "string" && message.trim() ? message.trim() : "Bu isteği tamamlamak için daha fazla bilgiye ihtiyacım var.",
    };
  }
  if (record.result !== "quote_and_followup_task") return { status: "NOT_HANDLED" };

  const customerNameRaw = typeof record.customerNameRaw === "string" ? record.customerNameRaw.trim() : "";
  const quoteAmount = typeof record.quoteAmount === "number" && Number.isFinite(record.quoteAmount) && record.quoteAmount > 0 ? record.quoteAmount : null;
  if (!customerNameRaw || !quoteAmount) {
    return { status: "CLARIFICATION_REQUIRED", message: "Hangi müşteri için ve ne tutarda bir teklif hazırlamamı istersiniz?" };
  }

  const quoteTitle = typeof record.quoteTitle === "string" && record.quoteTitle.trim() ? record.quoteTitle.trim() : `${customerNameRaw} Teklifi`;
  const quoteCurrency = typeof record.quoteCurrency === "string" && ["TRY", "USD", "EUR"].includes(record.quoteCurrency) ? record.quoteCurrency : "TRY";
  const taskDueInDaysRaw = typeof record.taskDueInDays === "number" && Number.isFinite(record.taskDueInDays) ? Math.round(record.taskDueInDays) : 2;
  const taskDueInDays = Math.min(Math.max(taskDueInDaysRaw, 1), 30);

  const customers = await listCustomers({ organizationId: input.auth.organization.id, limit: 5000 });
  const resolution = resolveCustomerReference(customers, customerNameRaw);
  if (resolution.status === "AMBIGUOUS") {
    return { status: "CLARIFICATION_REQUIRED", message: `"${customerNameRaw}" adıyla birden fazla müşteri var. Hangisini kastettiniz?` };
  }
  if (resolution.status === "NOT_FOUND") {
    return { status: "CLARIFICATION_REQUIRED", message: `"${customerNameRaw}" adında kayıtlı bir müşteri bulamadım.` };
  }

  const customer = resolution.customer;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + taskDueInDays);

  const plan: OrchestrationPlan = {
    steps: [
      {
        domain: "offer",
        actionName: "quote.create",
        buildInput: () => ({ customerId: customer.id, title: quoteTitle, amount: quoteAmount, currency: quoteCurrency }),
      },
      {
        domain: "task",
        actionName: "task.create",
        buildInput: (context) => {
          const quoteRef = context.priorResults[0];
          return {
            title: `${customer.displayName} müşterisini teklif hakkında ara`,
            ...(quoteRef ? { description: `İlgili teklif: ${quoteRef.entityId}` } : {}),
            dueDate: dueDate.toISOString(),
            priority: "MEDIUM",
          };
        },
      },
    ],
  };

  return {
    status: "PLAN_READY",
    plan,
    summary: `${customer.displayName} için ${quoteTitle} teklifi hazırlanacak, ${taskDueInDays} gün sonra aramanız için görev açılacak.`,
  };
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text.trim().replace(/^```json\n?|```$/g, ""));
  } catch {
    return null;
  }
}
