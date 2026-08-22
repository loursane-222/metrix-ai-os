import { actionRegistry } from "@/lib/action-runtime/registry";
import type { ActionDefinition } from "@/lib/action-runtime/registry";
import { ENTITY_REFERENCE_FIELDS } from "./entity-resolvers";

// The set of action-runtime actions the general orchestration planner is
// allowed to chain. Two safety filters, both deliberate:
//
// 1. actionClass === "DOMAIN" only — SURFACE actions (draft.set_field,
//    surface.navigate, ...) mutate ephemeral UI draft state tied to a
//    specific open screen, not durable business records; they make no
//    sense as a standalone orchestration step.
// 2. approvalPolicy === "NONE" only — an action that already requires an
//    explicit human approval gate (quote.dispatch, customer.archive,
//    payment.apply, ...) is deliberately excluded from autonomous
//    multi-step chains for now. The orchestration runtime has no
//    pause-for-approval-then-resume mechanism yet (see
//    executive-orchestration.types.ts) — chaining an approval-gated step
//    would just fail synchronously with APPROVAL_GRANT_MISSING today.
//
// A third, implicit filter: only actions with a non-empty inputSchema
// survive — an empty schema means the manifest never documented its real
// contract, so there is nothing safe to build a prompt or validate against
// (see the delivery.create fix in deliveries.actions.ts for what "fixing
// this" looks like for one action; the rest are a known, separate gap).
export function listPlannableActions(): readonly ActionDefinition[] {
  return actionRegistry
    .listActionsByClass("DOMAIN")
    .filter((definition) => definition.approvalPolicy === "NONE" && Object.keys(definition.inputSchema).length > 0);
}

// Short, human-readable purpose per action — the registry's inputSchema
// gives field shapes but not intent, and the model plans much more
// reliably with both. Deliberately only covers the actions this planner
// actually exposes (listPlannableActions() above); an action added to the
// registry without an entry here still gets a serviceable prompt line
// built from its dotted name and field list (see buildActionCatalogPrompt).
const ACTION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "customer.create": "Yeni bir müşteri kaydı oluşturur.",
  "customer.update": "Mevcut bir müşteri kaydını günceller.",
  "supplier.create": "Yeni bir tedarikçi kaydı oluşturur.",
  "supplier.update": "Mevcut bir tedarikçi kaydını günceller.",
  "product.create": "Yeni bir ürün/hizmet kaydı oluşturur.",
  "quote.create": "Bir müşteri için yeni bir teklif oluşturur.",
  "quote.update": "Mevcut bir teklifi günceller.",
  "quote.send": "Var olan bir teklifi müşteriye gönderilmiş olarak işaretler.",
  "order.create": "Bir müşteri için yeni bir sipariş oluşturur.",
  "delivery.create": "Var olan bir siparişten irsaliye/sevkiyat kaydı oluşturur.",
  "invoice.create": "Bir müşteri için yeni bir fatura oluşturur.",
  "invoice.send": "Var olan bir faturayı gönderilmiş olarak işaretler.",
  "payment.create": "Bir müşteriden yeni bir tahsilat/ödeme kaydı oluşturur.",
  "production.create": "Yeni bir üretim emri oluşturur.",
  "stock.receive": "Bir depoya ürün girişi (stok kabul) kaydeder.",
  "task.create": "Yeni bir görev oluşturur.",
  "task.complete": "Var olan bir görevi tamamlanmış olarak işaretler.",
  "executive_action.create": "Yönetim için yeni bir aksiyon kaydı oluşturur.",
  "company.profile.update": "Şirket profilini günceller.",
};

export type CatalogActionField = Readonly<{
  name: string;
  type: string;
  required: boolean;
  enumValues?: readonly string[];
  isEntityReference: boolean;
}>;

export type CatalogAction = Readonly<{
  actionName: string;
  description: string;
  fields: readonly CatalogActionField[];
}>;

export function buildActionCatalog(): readonly CatalogAction[] {
  return listPlannableActions().map((definition) => ({
    actionName: definition.actionName,
    description: ACTION_DESCRIPTIONS[definition.actionName] ?? `"${definition.actionName}" aksiyonunu çalıştırır.`,
    fields: Object.entries(definition.inputSchema).map(([name, schema]) => ({
      name,
      type: schema.type,
      required: schema.required,
      enumValues: schema.enumValues,
      isEntityReference: name in ENTITY_REFERENCE_FIELDS,
    })),
  }));
}

// Renders the catalog into the compact, LLM-readable table the planner
// prompt embeds. Entity-reference fields are called out explicitly so the
// model knows to supply a plain-language name/number there, never a
// guessed id — real ids are only ever produced by resolveEntityReference()
// against real organization data, downstream of the model's output.
export function renderActionCatalogForPrompt(catalog: readonly CatalogAction[]): string {
  return catalog
    .map((action) => {
      const fieldLines = action.fields.map((field) => {
        const req = field.required ? "zorunlu" : "opsiyonel";
        const kind = field.isEntityReference
          ? "gerçek bir ada/numaraya karşılık gelmeli (id değil, düz metin isim/numara ver)"
          : field.enumValues
            ? `değerlerden biri: ${field.enumValues.join(" | ")}`
            : field.type;
        return `    - ${field.name} (${req}, ${kind})`;
      });
      return [`  ${action.actionName}: ${action.description}`, ...fieldLines].join("\n");
    })
    .join("\n");
}
