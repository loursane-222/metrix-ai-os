import type { ModuleFieldDefinition, ModuleFieldValueType } from "@/lib/field-authority/field-authority";
import type { DocumentDomain } from "./document-classifier";

// One field registry per supported financial document domain. Every
// writable fieldId here is either (a) a literal input field of the exact
// canonical action business-candidate-action-runtime.executor.ts will call
// to promote the candidate (invoice.create / purchaseInvoice.
// createFromPurchaseOrder / expense.create / financialInstrument.register),
// or (b) an explicitly evidence-only field (suffixed `Evidence`) used ONLY
// for counterparty/purchase-order resolution — never sent to a canonical
// action directly, never persisted as a mutation field. This keeps
// extraction incapable of proposing a field the promotion path can't
// consume, by construction.
type Spec = { key: string; label: string; valueType: ModuleFieldValueType; required?: boolean; evidenceOnly?: boolean; options?: string[] };

function buildRegistry(domain: string, specs: readonly Spec[]): ModuleFieldDefinition[] {
  return specs.map((spec, index): ModuleFieldDefinition => ({
    fieldId: `document.${domain}.${spec.key}`,
    module: "documents",
    entityType: domain,
    key: spec.key,
    label: spec.label,
    description: `${spec.label} alanı (${domain} belgesi)`,
    valueType: spec.valueType,
    storageKind: "scalar",
    requiredOnCreate: spec.required === true,
    requiredOnUpdate: false,
    readable: true,
    writable: true,
    clearable: !spec.required,
    searchable: false,
    filterable: false,
    sortable: false,
    reportable: !spec.evidenceOnly,
    sourceOfTruth: "entity",
    sensitivity: "SENSITIVE",
    riskLevel: "HIGH",
    approvalPolicy: "EXPLICIT",
    permissionRead: "server-only",
    permissionWrite: "server-only",
    ...(spec.options ? { validation: { options: spec.options } } : {}),
    normalization: spec.valueType === "money" ? "money_cents" : spec.valueType === "percentage" ? "percentage_basis_points" : spec.valueType === "integer" ? "integer" : "trim",
    uiSection: spec.evidenceOnly ? "Kanıt (mutasyona gönderilmez)" : "Belgeden Çıkarılan Alanlar",
    uiOrder: index,
    custom: false,
    state: "ACTIVE",
  }));
}

export const SALES_INVOICE_FIELDS = buildRegistry("SALES_INVOICE", [
  { key: "customerNameEvidence", label: "Müşteri adı (kanıt)", valueType: "string", evidenceOnly: true },
  { key: "title", label: "Fatura başlığı", valueType: "string", required: true },
  { key: "amount", label: "Tutar", valueType: "string", required: true },
  { key: "taxRate", label: "KDV oranı", valueType: "string" },
  { key: "currency", label: "Para birimi", valueType: "string" },
  { key: "invoiceNumber", label: "Fatura numarası", valueType: "string" },
  { key: "dueDate", label: "Vade tarihi", valueType: "string" },
]);

export const PURCHASE_INVOICE_FIELDS = buildRegistry("PURCHASE_INVOICE", [
  { key: "supplierNameEvidence", label: "Tedarikçi adı (kanıt)", valueType: "string", evidenceOnly: true },
  { key: "poNumberEvidence", label: "Satınalma sipariş no (kanıt)", valueType: "string", evidenceOnly: true },
  { key: "supplierInvoiceNumber", label: "Tedarikçi fatura numarası", valueType: "string", required: true },
  { key: "dueDate", label: "Vade tarihi", valueType: "string" },
  { key: "notes", label: "Notlar", valueType: "string" },
]);

export const EXPENSE_RECEIPT_FIELDS = buildRegistry("EXPENSE_RECEIPT", [
  { key: "title", label: "Gider başlığı", valueType: "string", required: true },
  { key: "category", label: "Kategori", valueType: "string", required: true },
  { key: "amount", label: "Tutar", valueType: "string", required: true },
  { key: "expenseDate", label: "Gider tarihi", valueType: "string", required: true },
  { key: "currency", label: "Para birimi", valueType: "string" },
  { key: "vendorName", label: "Satıcı adı", valueType: "string" },
  { key: "supplierNameEvidence", label: "Tedarikçi adı (kanıt)", valueType: "string", evidenceOnly: true },
  { key: "netAmount", label: "Net tutar", valueType: "string" },
  { key: "taxRate", label: "KDV oranı", valueType: "string" },
  { key: "taxAmount", label: "KDV tutarı", valueType: "string" },
  { key: "note", label: "Not", valueType: "string" },
]);

export const FINANCIAL_INSTRUMENT_FIELDS = buildRegistry("FINANCIAL_INSTRUMENT", [
  { key: "counterpartyNameEvidence", label: "Karşı taraf adı (kanıt)", valueType: "string", evidenceOnly: true },
  { key: "instrumentType", label: "Enstrüman türü", valueType: "enum", required: true, options: ["CHEQUE", "PROMISSORY_NOTE"] },
  { key: "direction", label: "Yön", valueType: "enum", required: true, options: ["RECEIVED", "ISSUED"] },
  { key: "amount", label: "Tutar", valueType: "string", required: true },
  { key: "currency", label: "Para birimi", valueType: "string" },
  { key: "issueDate", label: "Düzenleme tarihi", valueType: "string" },
  { key: "maturityDate", label: "Vade tarihi", valueType: "string", required: true },
  { key: "instrumentNumber", label: "Enstrüman numarası", valueType: "string" },
  { key: "bankName", label: "Banka adı", valueType: "string" },
  { key: "branchName", label: "Şube adı", valueType: "string" },
  { key: "drawerName", label: "Keşideci", valueType: "string" },
  { key: "notes", label: "Notlar", valueType: "string" },
]);

export function fieldRegistryForDomain(domain: DocumentDomain): readonly ModuleFieldDefinition[] | null {
  switch (domain) {
    case "SALES_INVOICE": return SALES_INVOICE_FIELDS;
    case "PURCHASE_INVOICE": return PURCHASE_INVOICE_FIELDS;
    case "EXPENSE_RECEIPT": return EXPENSE_RECEIPT_FIELDS;
    case "CHEQUE":
    case "PROMISSORY_NOTE": return FINANCIAL_INSTRUMENT_FIELDS;
    case "UNKNOWN": return null;
  }
}
