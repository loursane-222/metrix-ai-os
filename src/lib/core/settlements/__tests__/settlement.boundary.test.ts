import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { paymentActionDefinitions } from "@/lib/action-runtime/registry/manifests/payments.actions";
import { settlementActionDefinitions } from "@/lib/action-runtime/registry/manifests/settlements.actions";

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listSourceFiles(full);
    return /\.(ts|tsx)$/u.test(entry.name) && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("Phase 3 authority boundaries", () => {
  const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = fs.readFileSync(
    path.join(process.cwd(), "prisma/migrations/20260830200000_add_settlement_application_movement_authority/migration.sql"),
    "utf8",
  );
  const settlementModel = schema.match(/model Settlement \{[\s\S]*?\n\}/u)?.[0] ?? "";
  const applicationModel = schema.match(/model Application \{[\s\S]*?\n\}/u)?.[0] ?? "";
  const movementModel = schema.match(/model FinancialAccountMovement \{[\s\S]*?\n\}/u)?.[0] ?? "";

  it("has no mutable balance scalar anywhere in the new authority", () => {
    for (const model of [settlementModel, applicationModel, movementModel]) {
      expect(model).not.toMatch(/\bbalance\b/iu);
    }
  });

  it("makes every new row immutable-by-convention: reversal is a new row, never an update path", () => {
    for (const model of [settlementModel, applicationModel, movementModel]) {
      expect(model).toContain("reversalOfId");
    }
    expect(migration).not.toMatch(/UPDATE "Settlement"|UPDATE "Application"|UPDATE "FinancialAccountMovement"/u);
  });

  it("keeps the migration additive-only — no dropped columns on Payment, Invoice, FinancialAccount or Ledger*", () => {
    expect(migration).not.toMatch(/DROP COLUMN/iu);
    expect(migration).not.toMatch(/ALTER TABLE "Payment"/u);
    expect(migration).not.toMatch(/ALTER TABLE "Invoice"/u);
    expect(migration).not.toMatch(/ALTER TABLE "FinancialAccount"/u);
  });

  it("requires payment.apply to carry a settlement method and a resolvable financial account", () => {
    const apply = paymentActionDefinitions.find((item) => item.actionName === "payment.apply")!;
    expect(apply.inputSchema.paymentMethod).toMatchObject({ required: true });
    expect(apply.inputSchema.financialAccountReference).toMatchObject({ required: true });
  });

  it("exposes reversal only — no own-account transfer action ships in Phase 3", () => {
    expect(settlementActionDefinitions.map((item) => item.actionName)).toEqual(["settlement.reverse"]);
  });

  it("restricts settlement.reverse to a narrower permission than ordinary payment writes", () => {
    const reverse = settlementActionDefinitions.find((item) => item.actionName === "settlement.reverse")!;
    expect(reverse.requiredPermissionSet).toEqual(["payments.reverse"]);
    expect(reverse.requiredPermissionSet).not.toContain("payments.write");
  });

  it("adds referenceNumber/externalReference to Settlement as nullable — never NOT NULL", () => {
    expect(settlementModel).toMatch(/referenceNumber\s+String\?/u);
    expect(settlementModel).toMatch(/externalReference\s+String\?/u);
    expect(migration).toMatch(/"referenceNumber" TEXT,/u);
    expect(migration).toMatch(/"externalReference" TEXT,/u);
    expect(migration).not.toMatch(/"referenceNumber" TEXT NOT NULL/u);
    expect(migration).not.toMatch(/"externalReference" TEXT NOT NULL/u);
  });

  it("FinancialAccountMovement immutable contract: repository declares no update/delete function", () => {
    const repositorySource = fs.readFileSync(path.join(process.cwd(), "src/lib/core/settlements/settlement.repository.ts"), "utf8");
    expect(repositorySource).not.toMatch(/export function \w*(update|delete)\w*/iu);
  });

  it("FinancialAccountMovement immutable contract: no update/delete call on the new authority's Prisma delegates anywhere in the app", () => {
    const forbidden = /\.(settlement|application|financialAccountMovement)\.(update|updateMany|delete|deleteMany)\(/u;
    const offenders: string[] = [];
    for (const dir of [path.join(process.cwd(), "src/lib"), path.join(process.cwd(), "src/app")]) {
      for (const file of listSourceFiles(dir)) {
        const content = fs.readFileSync(file, "utf8");
        if (forbidden.test(content)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
