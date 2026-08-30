import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { obligationActionDefinitions } from "@/lib/action-runtime/registry/manifests/obligations.actions";

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listSourceFiles(full);
    return /\.(ts|tsx)$/u.test(entry.name) && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("Phase 5 authority boundaries", () => {
  const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = fs.readFileSync(
    path.join(process.cwd(), "prisma/migrations/20260830220000_add_obligation_schedule_authority/migration.sql"),
    "utf8",
  );
  const lineModel = schema.match(/model ObligationScheduleLine \{[\s\S]*?\n\}/u)?.[0] ?? "";
  const serviceSource = fs.readFileSync(path.join(process.cwd(), "src/lib/core/obligations/obligation-schedule.service.ts"), "utf8");

  it("HARD INVARIANT: maturity schedule ≠ payment method — no paymentMethod field on ObligationScheduleLine", () => {
    expect(lineModel).not.toMatch(/paymentMethod/iu);
  });

  it("HARD INVARIANT: receivable/payable ≠ settlement/payment — no amount-settled/paidAmount/balance scalar on the schedule line itself", () => {
    expect(lineModel).not.toMatch(/paidAmount|settledAmount|openAmount|\bbalance\b/iu);
  });

  it("HARD INVARIANT: obligation doğduğunda para hareketi oluşmaz — materialization never touches Ledger/Settlement/ExpenseSettlement/FinancialAccountMovement authority", () => {
    expect(serviceSource).not.toMatch(/ledger\.service|recordPaymentApplication|recordExpenseSettlementApplication|recordInvoiceSent|recordExpenseCreated/iu);
    expect(serviceSource).not.toMatch(/from ["']@\/lib\/core\/settlements|from ["']@\/lib\/core\/expenses\/expense-settlement\.service/u);
  });

  it("is immutable-by-convention: repository declares no update/delete function", () => {
    const repositorySource = fs.readFileSync(path.join(process.cwd(), "src/lib/core/obligations/obligation-schedule.repository.ts"), "utf8");
    expect(repositorySource).not.toMatch(/export function \w*(update|delete)\w*/iu);
  });

  it("no update/delete call on ObligationScheduleLine's Prisma delegate anywhere in the app", () => {
    const forbidden = /\.obligationScheduleLine\.(update|updateMany|delete|deleteMany)\(/u;
    const offenders: string[] = [];
    for (const dir of [path.join(process.cwd(), "src/lib"), path.join(process.cwd(), "src/app")]) {
      for (const file of listSourceFiles(dir)) {
        if (forbidden.test(fs.readFileSync(file, "utf8"))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the migration purely additive — no dropped columns/tables, and Payment/Expense/Settlement/ExpenseSettlement/Invoice are not reinterpreted", () => {
    expect(migration).not.toMatch(/DROP COLUMN|DROP TABLE/iu);
    expect(migration).not.toMatch(/ALTER TABLE "Payment"|ALTER TABLE "Expense"|ALTER TABLE "Settlement"|ALTER TABLE "ExpenseSettlement"|ALTER TABLE "Invoice"|ALTER TABLE "FinancialAccountMovement"/u);
  });

  it("does not bypass Phase 3/4 settlement authority — Payment/Expense gain only a nullable 1:1 back-relation, no new mutable field", () => {
    const paymentModel = schema.match(/model Payment \{[\s\S]*?\n\}/u)?.[0] ?? "";
    const expenseModel = schema.match(/model Expense \{[\s\S]*?\n\}/u)?.[0] ?? "";
    expect(paymentModel).toMatch(/obligationScheduleLine\s+ObligationScheduleLine\?/u);
    expect(expenseModel).toMatch(/obligationScheduleLine\s+ObligationScheduleLine\?/u);
  });

  it("reuses existing permissions (invoices.write / expenses.write) — no new obligations-specific permission invented", () => {
    const materializeReceivable = obligationActionDefinitions.find((item) => item.actionName === "obligation.materializeReceivable")!;
    const materializePayable = obligationActionDefinitions.find((item) => item.actionName === "obligation.materializePayable")!;
    expect(materializeReceivable.requiredPermissionSet).toEqual(["invoices.write"]);
    expect(materializePayable.requiredPermissionSet).toEqual(["expenses.write"]);
  });

  it("keeps both materialize actions at NONE approval / LOW risk — no real money movement happens here", () => {
    for (const action of obligationActionDefinitions) {
      expect(action.approvalPolicy).toBe("NONE");
      expect(action.riskLevelBase).toBe("LOW");
    }
  });

  it("CALENDAR/REPORT NOT SOURCE-OF-TRUTH: no calendar or notification-scheduling code is touched by this authority", () => {
    expect(serviceSource).not.toMatch(/calendar|CalendarEvent/iu);
  });
});
