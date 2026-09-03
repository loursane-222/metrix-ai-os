import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../../..");
const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), "utf8");

/**
 * Static source contract: every route below must be a real production
 * entry point for its capability, executed through executeCanonicalOperation
 * — not a re-implementation and not a second execution path. Mirrors the
 * style of chat's single-authority-source-contract.test.ts (asserts on the
 * route's own source), because these routes have no full request-level
 * test harness (real DB/Prisma) to exercise behaviorally.
 */
const ROUTES: readonly { path: string; capability: string }[] = [
  { path: "src/app/api/customers/[customerId]/actions/update/route.ts", capability: "customer.update" },
  { path: "src/app/api/customers/[customerId]/actions/archive/route.ts", capability: "customer.archive" },
  { path: "src/app/api/quotes/[quoteId]/actions/update/route.ts", capability: "quote.update" },
  { path: "src/app/api/quotes/[quoteId]/actions/send/route.ts", capability: "quote.send" },
  { path: "src/app/api/invoices/[invoiceId]/actions/send/route.ts", capability: "invoice.send" },
  { path: "src/app/api/payments/[paymentId]/actions/apply/route.ts", capability: "settlement.create" },
  { path: "src/app/api/tasks/[taskId]/actions/complete/route.ts", capability: "task.complete" },
  { path: "src/app/api/orders/[orderId]/route.ts", capability: "order.update" },
  { path: "src/app/api/orders/[orderId]/route.ts", capability: "order.cancel" },
  { path: "src/app/api/stock/route.ts", capability: "inventory.receive" },
  { path: "src/app/api/stock/transfer/route.ts", capability: "inventory.transfer" },
  { path: "src/app/api/organization-members/[memberId]/route.ts", capability: "team.update" },
  { path: "src/app/api/calendar-events/route.ts", capability: "calendar.create" },
  { path: "src/app/api/calendar-events/[id]/route.ts", capability: "calendar.update" },
  { path: "src/app/api/calendar-events/[id]/reschedule/route.ts", capability: "calendar.reschedule" },
];

describe("production HTTP routes execute through executeCanonicalOperation", () => {
  for (const route of ROUTES) {
    it(`${route.path} calls executeCanonicalOperation with capability "${route.capability}"`, () => {
      const source = read(route.path);
      expect(source).toContain("executeCanonicalOperation");
      expect(source).toContain(`"${route.capability}"`);
    });
  }

  it("none of these routes call productionExecutionRuntime.executeAction directly (single execution boundary)", () => {
    for (const route of ROUTES) {
      const source = read(route.path);
      expect(source, `${route.path} should not bypass executeCanonicalOperation`).not.toContain("productionExecutionRuntime.executeAction");
    }
  });
});

describe("chat route's company-truth query goes through executeCanonicalOperation", () => {
  const source = read("src/app/api/ai/chat/route.ts");

  it("compiles the queryPlan into a CanonicalOperation QUERY against the company.query capability", () => {
    expect(source).toContain("executeCanonicalOperation");
    expect(source).toContain('capability: "company.query"');
    expect(source).toContain('type: "QUERY"');
  });

  it("does not call executeCompanyQueryPlan directly anymore (single execution boundary)", () => {
    expect(source).not.toContain("executeCompanyQueryPlan(");
  });
});
