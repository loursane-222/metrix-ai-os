import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expenseActionDefinitions } from "@/lib/action-runtime/registry/manifests/expenses.actions";

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listSourceFiles(full);
    return /\.(ts|tsx)$/u.test(entry.name) && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("Phase 4 authority boundaries", () => {
  const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = fs.readFileSync(
    path.join(process.cwd(), "prisma/migrations/20260830210000_add_expense_settlement_authority/migration.sql"),
    "utf8",
  );
  const expenseModel = schema.match(/model Expense \{[\s\S]*?\n\}/u)?.[0] ?? "";
  const settlementModel = schema.match(/model ExpenseSettlement \{[\s\S]*?\n\}/u)?.[0] ?? "";

  it("Expense keeps amount as the total (no reinterpreted meaning) with paidAmount as a settlement-derived cache", () => {
    expect(expenseModel).toContain("amount");
    expect(expenseModel).toContain("paidAmount");
    expect(expenseModel).not.toMatch(/\bbalance\b/iu);
  });

  it("ExpenseSettlement has no mutable balance scalar and is immutable-by-convention", () => {
    expect(settlementModel).not.toMatch(/\bbalance\b/iu);
    expect(settlementModel).toContain("reversalOfId");
  });

  it("IDEMPOTENCY: ExpenseSettlement has a DB-backed replay authority — nullable idempotencyKey/requestHash plus a scoped unique constraint", () => {
    expect(settlementModel).toMatch(/idempotencyKey\s+String\?/u);
    expect(settlementModel).toMatch(/requestHash\s+String\?/u);
    expect(settlementModel).toContain("@@unique([organizationId, expenseId, idempotencyKey])");
    expect(migration).toMatch(/CREATE UNIQUE INDEX "ExpenseSettlement_organizationId_expenseId_idempotencyKey_key"/u);
  });

  it("ExpenseSettlement repository declares no update/delete function", () => {
    const repositorySource = fs.readFileSync(path.join(process.cwd(), "src/lib/core/expenses/expense-settlement.repository.ts"), "utf8");
    expect(repositorySource).not.toMatch(/export function \w*(update|delete)\w*/iu);
  });

  it("no update/delete call on ExpenseSettlement's Prisma delegate anywhere in the app", () => {
    const forbidden = /\.expenseSettlement\.(update|updateMany|delete|deleteMany)\(/u;
    const offenders: string[] = [];
    for (const dir of [path.join(process.cwd(), "src/lib"), path.join(process.cwd(), "src/app")]) {
      for (const file of listSourceFiles(dir)) {
        if (forbidden.test(fs.readFileSync(file, "utf8"))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the migration additive-only — no dropped columns anywhere", () => {
    expect(migration).not.toMatch(/DROP COLUMN/iu);
    expect(migration).not.toMatch(/DROP TABLE/iu);
  });

  it("does not reinterpret Settlement/Application (Phase 3) — only FinancialAccountMovement gets the additive expenseSettlementId link", () => {
    expect(migration).not.toMatch(/ALTER TABLE "Settlement"/u);
    expect(migration).not.toMatch(/ALTER TABLE "Application"/u);
    expect(migration).toMatch(/ADD COLUMN "expenseSettlementId" TEXT/u);
  });

  it("requires expense.settle to carry a settlement method and a resolvable financial account, gated CONDITIONAL/HIGH like payment.apply", () => {
    const settle = expenseActionDefinitions.find((item) => item.actionName === "expense.settle")!;
    expect(settle.inputSchema.paymentMethod).toMatchObject({ required: true });
    expect(settle.inputSchema.financialAccountReference).toMatchObject({ required: true });
    expect(settle.approvalPolicy).toBe("CONDITIONAL");
    expect(settle.riskLevelBase).toBe("HIGH");
  });

  it("restricts expense.settlement.reverse to a narrower permission than ordinary expense writes", () => {
    const reverse = expenseActionDefinitions.find((item) => item.actionName === "expense.settlement.reverse")!;
    expect(reverse.requiredPermissionSet).toEqual(["expenses.reverse"]);
    expect(reverse.requiredPermissionSet).not.toContain("expenses.write");
  });

  it("keeps expense.create/update/cancel at NONE approval — only real money movement (settle/reverse) requires approval", () => {
    for (const name of ["expense.create", "expense.update", "expense.cancel"]) {
      const action = expenseActionDefinitions.find((item) => item.actionName === name)!;
      expect(action.approvalPolicy).toBe("NONE");
    }
  });
});
