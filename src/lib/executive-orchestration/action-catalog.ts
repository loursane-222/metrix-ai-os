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
// 2. approvalPolicy === "NONE" or "EXPLICIT" only — CONDITIONAL is excluded
//    (its risk depends on runtime context the planner can't evaluate ahead
//    of time). EXPLICIT actions (quote.dispatch, customer.archive, ...) ARE
//    included — the orchestration runtime pauses the whole chain in
//    AWAITING_APPROVAL and resumes it once a human approves in a later turn
//    (see executive-orchestration.service.ts); they are never executed
//    autonomously.
//
// A third, implicit filter: only actions with a non-empty inputSchema
// survive — an empty schema means the manifest never documented its real
// contract, so there is nothing safe to build a prompt or validate against.
// delivery.create (deliveries.actions.ts), the order/production/stock/
// supplier actions from the Büyük Resim Faz 2 pass, and every id-only
// compensator (machine.archive, payment.void, task.cancel,
// executive_action.cancel/complete, company.unit.archive,
// company.field_definition.deprecate, collection.set_lifecycle) all had
// this gap closed the same way — each got a real schema, a real handler,
// and an entity-resolver domain for every reference field (see
// entity-resolvers.ts), so none of them needed to join the denylist below.
// custom_field.* are the one remaining exclusion, and for a different
// reason: they are schema/admin actions, not something a business
// utterance naturally chains.
const EXCLUDED_ACTION_NAMES = new Set([
  "custom_field.create",
  "custom_field.deprecate",
  "custom_field.update_definition",
  // field_visit.create is deliberately excluded from the general planner —
  // it has its own dedicated conversation extension (field-visit-
  // conversation-extension.ts) with real structured extraction and careful
  // order/payment-linkage safety rules the generic action-only planner
  // can't reproduce; it must never be reachable through a second, more
  // naive path.
  "field_visit.create",
]);

export function listPlannableActions(): readonly ActionDefinition[] {
  return actionRegistry
    .listActionsByClass("DOMAIN")
    .filter((definition) =>
      (definition.approvalPolicy === "NONE" || definition.approvalPolicy === "EXPLICIT")
      && Object.keys(definition.inputSchema).length > 0
      && !EXCLUDED_ACTION_NAMES.has(definition.actionName));
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
  "delivery.transitionStatus": "Bir irsaliyenin durumunu (ör. hazırlanıyor, yola çıktı, teslim edildi) değiştirir.",
  "invoice.create": "Bir müşteri için yeni bir fatura oluşturur.",
  "invoice.send": "Var olan bir faturayı gönderilmiş olarak işaretler.",
  "payment.create": "Bir müşteriden yeni bir tahsilat/ödeme kaydı oluşturur.",
  "collection.start": "Bir ödeme için tahsilat takibini başlatır veya var olan açık takibi devam ettirir.",
  "production.create": "Yeni bir üretim emri oluşturur.",
  "stock.receive": "Bir depoya ürün girişi (stok kabul) kaydeder.",
  "task.create": "Yeni bir görev oluşturur.",
  "task.complete": "Var olan bir görevi tamamlanmış olarak işaretler.",
  "executive_action.create": "Yönetim için yeni bir aksiyon kaydı oluşturur.",
  "company.profile.update": "Şirket profilini günceller.",
  "quote.dispatch": "Var olan bir teklifi müşteriye e-posta ile gönderir (onay gerektirir).",
  "quote.set_lifecycle": "Bir teklifi kazanıldı/kaybedildi/iptal olarak sonuçlandırır (onay gerektirir).",
  "customer.archive": "Bir müşteriyi pasifleştirir (onay gerektirir).",
  "integration.bizimhesap.push_invoice": "Var olan bir faturayı METRIX dışındaki Bizim Hesap muhasebe sistemine gönderir/aktarır — invoice.send'den farklıdır, o yalnızca METRIX içinde \"gönderildi\" olarak işaretler, dış sisteme veri göndermez (onay gerektirir).",
  "order.transitionStatus": "Bir siparişin durumunu (onaylandı, üretimde, sevk edildi vb.) değiştirir.",
  "order.cancel": "Bir siparişi iptal eder.",
  "production.update": "Mevcut bir üretim emrinin durumunu/miktarlarını/planını günceller.",
  "production.archive": "Bir üretim emrini arşivler.",
  "workCenter.create": "Yeni bir iş merkezi (üretim istasyonu) oluşturur.",
  "machine.create": "Bir iş merkezine yeni bir makine kaydı ekler.",
  "stock.transfer": "Bir ürünü bir depodan başka bir depoya transfer eder.",
  "stock.adjustment": "Fiziksel sayıma göre bir ürünün stok miktarını düzeltir.",
  "warehouse.create": "Yeni bir depo oluşturur.",
  "supplier.archive": "Bir tedarikçiyi pasifleştirir.",
  "product.archive": "Bir ürün/hizmet kaydını arşivler.",
  "delivery.cancel": "Bir irsaliyeyi/sevkiyatı iptal eder.",
  "warehouse.archive": "Bir depoyu arşivler.",
  "workCenter.archive": "Bir iş merkezini (üretim istasyonunu) arşivler.",
  "customer.unarchive": "Pasifleştirilmiş bir müşteriyi tekrar aktif eder (onay gerektirir).",
  "invoice.void": "Bir taslak faturayı iptal eder.",
  "executive_action.complete": "Bir yönetim aksiyonunu sonuç durumuyla (başarılı/kısmi/başarısız) tamamlanmış olarak işaretler (onay gerektirir).",
  "executive_action.cancel": "Bir yönetim aksiyonunu iptal eder.",
  "collection.set_lifecycle": "Bir tahsilat takibini devam ediyor/tamamlandı/reddedildi olarak sonuçlandırır (onay gerektirir).",
  "machine.archive": "Bir makineyi arşivler.",
  "payment.void": "Bir tahsilat/ödeme kaydını iptal eder.",
  "task.cancel": "Bir görevi iptal eder.",
  "company.unit.archive": "Bir şirket birimini (şube/lokasyon) pasifleştirir.",
  "company.field_definition.deprecate": "Şirket için tanımlanmış özel bir alanı kullanımdan kaldırır.",
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
  requiresApproval: boolean;
  fields: readonly CatalogActionField[];
}>;

export function buildActionCatalog(): readonly CatalogAction[] {
  return listPlannableActions().map((definition) => ({
    actionName: definition.actionName,
    description: ACTION_DESCRIPTIONS[definition.actionName] ?? `"${definition.actionName}" aksiyonunu çalıştırır.`,
    requiresApproval: definition.approvalPolicy === "EXPLICIT",
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
      const approvalNote = action.requiresApproval ? " [ONAY GEREKTİRİR — bu adımda plan durur, kullanıcı onaylayana kadar çalışmaz]" : "";
      return [`  ${action.actionName}: ${action.description}${approvalNote}`, ...fieldLines].join("\n");
    })
    .join("\n");
}
