import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinancialAccountType } from "@prisma/client";
import type { ActionExecutionEnvelope } from "../../../execution";

const { createFinancialAccount, updateFinancialAccount } = vi.hoisted(() => ({ createFinancialAccount: vi.fn(), updateFinancialAccount: vi.fn() }));
vi.mock("@/lib/financial-accounts", () => ({ createFinancialAccount, updateFinancialAccount, deactivateFinancialAccount: vi.fn(), getFinancialAccount: vi.fn() }));
import { financialAccountCreateHandler, financialAccountUpdateHandler } from "../financial-account-handlers";

describe("financial account Action Runtime boundary", () => {
  beforeEach(() => { createFinancialAccount.mockReset().mockResolvedValue({ id: "account-1" }); updateFinancialAccount.mockReset().mockResolvedValue({ id: "account-1" }); });
  it("takes organization scope only from trusted execution context", async () => {
    await financialAccountCreateHandler({
      executionId: "exec-1", actionName: "financial_account.create",
      input: { organizationId: "attacker-org", type: FinancialAccountType.CASH, name: "Merkez Kasa", currency: "TRY" },
      executionContext: { actorId: "actor-1", organizationId: "trusted-org", role: "OWNER", permissions: ["financial_accounts.create"], sessionRef: "session-1", issuedAt: "2026-08-30T00:00:00.000Z", expiresAt: "2026-08-30T01:00:00.000Z" },
      idempotencyKey: "key-1", startedAt: "2026-08-30T00:00:00.000Z",
    } as ActionExecutionEnvelope);
    expect(createFinancialAccount).toHaveBeenCalledWith("trusted-org", expect.objectContaining({ type: FinancialAccountType.CASH, name: "Merkez Kasa", currency: "TRY" }));
  });
  it("rejects attempted type or currency mutations from a normal update", async () => {
    const request = {
      executionId: "exec-2", actionName: "financial_account.update",
      input: { financialAccountId: "account-1" },
      executionContext: { actorId: "actor-1", organizationId: "trusted-org", role: "OWNER", permissions: ["financial_accounts.update"], sessionRef: "session-1", issuedAt: "2026-08-30T00:00:00.000Z", expiresAt: "2026-08-30T01:00:00.000Z" },
      idempotencyKey: "key-2", startedAt: "2026-08-30T00:00:00.000Z",
    } as ActionExecutionEnvelope;
    await expect(financialAccountUpdateHandler({ ...request, input: { financialAccountId: "account-1", name: "Yeni Ad", type: FinancialAccountType.BANK } })).rejects.toThrow("type is immutable");
    await expect(financialAccountUpdateHandler({ ...request, input: { financialAccountId: "account-1", currency: "EUR" } })).rejects.toThrow("currency is immutable");
    expect(updateFinancialAccount).not.toHaveBeenCalled();
  });
});
