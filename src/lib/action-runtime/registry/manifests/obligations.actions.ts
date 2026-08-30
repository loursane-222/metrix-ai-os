import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "obligations";

/**
 * NONE/LOW risk, invoice.create/expense.create ile aynı sınıflandırma:
 * materialize etmek yalnız schedule kayıtları + boş Payment kabukları
 * üretir, hiçbir para hareketi yaratmaz (bkz. obligation-schedule.service.ts
 * başlık yorumu). Gerçek para hareketi gerektiren adımlar zaten kendi
 * CONDITIONAL/HIGH action'larıdır (payment.apply, expense.settle).
 */
export const obligationActionDefinitions: ActionDefinition[] = [
  {
    actionName: "obligation.materializeReceivable",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      invoiceId: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["invoices.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "obligation.materializePayable",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      expenseId: { type: "string", required: true },
      dueDate: { type: "string", required: true },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["expenses.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
];
