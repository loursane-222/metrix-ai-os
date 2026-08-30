import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { financialAccountActionDefinitions } from "@/lib/action-runtime/registry/manifests/financial-accounts.actions";

describe("Phase 2 authority boundaries", () => {
  const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260830190000_add_financial_account_authority/migration.sql"), "utf8");
  const model = schema.match(/model FinancialAccount \{[\s\S]*?\n\}/u)?.[0] ?? "";

  it("has one org-scoped identity authority with no balance or movement relation", () => {
    expect(model).toContain("organizationId");
    expect(model).toContain("currency");
    expect(model).not.toMatch(/\bbalance\b/u);
    expect(model).not.toMatch(/openingBalance|moneyMovement|settlement/iu);
  });
  it("does not reinterpret LedgerAccount", () => { expect(schema).toContain("model LedgerAccount {"); expect(model).not.toContain("LedgerAccount"); });
  it("keeps type and currency out of update and uses scoped permissions without approval inflation", () => {
    const update = financialAccountActionDefinitions.find((item) => item.actionName === "financial_account.update")!;
    expect(update.inputSchema).not.toHaveProperty("type"); expect(update.inputSchema).not.toHaveProperty("currency");
    expect(financialAccountActionDefinitions.map((item) => item.requiredPermissionSet[0])).toEqual(["financial_accounts.create", "financial_accounts.update", "financial_accounts.deactivate"]);
    expect(financialAccountActionDefinitions.every((item) => item.approvalPolicy === "NONE")).toBe(true);
  });
  it("enforces IBAN uniqueness per organization rather than globally", () => {
    expect(schema).toContain("@@unique([organizationId, iban])");
    expect(migration).toContain('UNIQUE INDEX "FinancialAccount_organizationId_iban_key" ON "FinancialAccount"("organizationId", "iban")');
    expect(migration).not.toMatch(/UNIQUE INDEX[^\n]+ON "FinancialAccount"\("iban"\)/u);
  });
  it("creates no payment, expense, cheque, card statement, movement, calendar or reporting handler", () => {
    expect(financialAccountActionDefinitions.map((item) => item.actionName)).toEqual(["financial_account.create", "financial_account.update", "financial_account.deactivate"]);
  });
});
