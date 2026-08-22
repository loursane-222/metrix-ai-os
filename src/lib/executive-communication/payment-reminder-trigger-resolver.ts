import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { sendPaymentReminder } from "./executive-communication.service";
import type { SendPaymentReminderOutcome } from "./executive-communication.types";
import type { GeneratePaymentReminderText } from "./payment-reminder-ai-adapter";

export type PaymentReminderTriggerOutcome =
  | Readonly<{ status: "SENT"; customerName: string; result: Extract<SendPaymentReminderOutcome, { outcome: "SENT" }> }>
  | Readonly<{ status: "NOT_HANDLED" }>
  | Readonly<{ status: "CLARIFICATION_NEEDED"; candidateNames: readonly string[] }>
  | Readonly<{ status: "NO_OUTSTANDING_BALANCE"; customerName: string }>
  | Readonly<{ status: "SEND_FAILED"; customerName: string; error: string }>;

// Same narrow-JSON-classifier convention as order-edit-command-resolver.ts —
// the customer name is a raw text span here, resolved deterministically
// afterwards (never trusted from the model as an ID).
const SYSTEM_PROMPT = [
  "Sen METRIX'te bir müşteriye tahsilat/ödeme hatırlatma e-postası gönderme isteğini yorumlayan dar bir JSON sınıflandırıcısısın.",
  "Yalnızca aşağıdaki şemalardan TEK bir JSON nesnesi üret; açıklama, markdown veya kod bloğu ekleme.",
  '{"result":"payment_reminder","customerNameRaw":"<mesajda geçen müşteri/firma adı>"}',
  '{"result":"unsupported"}',
  '{"result":"clarification_required","message":"<kısa Türkçe soru>"}',
  "Mesaj bir müşteriye tahsilat/ödeme hatırlatması gönderme isteği değilse unsupported dön.",
  "Müşteri adı belirsizse veya yoksa clarification_required dön, uydurma.",
].join("\n");

export async function resolveAndSendPaymentReminder(input: {
  utterance: string;
  organizationId: string;
  actorUserId: string;
  generateText: GeneratePaymentReminderText;
}): Promise<PaymentReminderTriggerOutcome> {
  const raw = await input.generateText({ systemPrompt: SYSTEM_PROMPT, userMessage: input.utterance });
  const parsed = parseJsonSafely(raw);
  if (!parsed || typeof parsed !== "object") return { status: "NOT_HANDLED" };

  const record = parsed as Record<string, unknown>;
  if (record.result === "unsupported") return { status: "NOT_HANDLED" };
  if (record.result === "clarification_required") {
    return { status: "CLARIFICATION_NEEDED", candidateNames: [] };
  }
  if (record.result !== "payment_reminder") return { status: "NOT_HANDLED" };

  const customerNameRaw = typeof record.customerNameRaw === "string" ? record.customerNameRaw.trim() : "";
  if (!customerNameRaw) {
    return { status: "CLARIFICATION_NEEDED", candidateNames: [] };
  }

  const customers = await listCustomers({ organizationId: input.organizationId, limit: 5000 });
  const resolution = resolveCustomerReference(customers, customerNameRaw);
  if (resolution.status === "AMBIGUOUS") {
    return { status: "CLARIFICATION_NEEDED", candidateNames: resolution.options.slice(0, 5).map((option) => option.displayName) };
  }
  if (resolution.status === "NOT_FOUND") {
    return { status: "CLARIFICATION_NEEDED", candidateNames: [] };
  }

  const customer = resolution.customer;
  const outcome = await sendPaymentReminder({ organizationId: input.organizationId, customerId: customer.id, actorUserId: input.actorUserId });

  if (outcome.outcome === "SENT") return { status: "SENT", customerName: customer.displayName, result: outcome };
  if (outcome.outcome === "NO_OUTSTANDING_BALANCE") return { status: "NO_OUTSTANDING_BALANCE", customerName: customer.displayName };
  if (outcome.outcome === "MISSING_RECIPIENT_EMAIL") return { status: "SEND_FAILED", customerName: customer.displayName, error: "Müşterinin kayıtlı bir e-posta adresi yok." };
  if (outcome.outcome === "CUSTOMER_NOT_FOUND") return { status: "SEND_FAILED", customerName: customer.displayName, error: "Müşteri bulunamadı." };
  return { status: "SEND_FAILED", customerName: customer.displayName, error: outcome.error };
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text.trim().replace(/^```json\n?|```$/g, ""));
  } catch {
    return null;
  }
}
