import { describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { assertApplicationWithinSettlement, assertPositiveAmount, assertSupportedSettlementMethod, computeSettlementRequestHash } from "../settlement.contract";

describe("assertSupportedSettlementMethod", () => {
  it("accepts CASH and BANK_TRANSFER", () => {
    expect(() => assertSupportedSettlementMethod(PaymentMethod.CASH)).not.toThrow();
    expect(() => assertSupportedSettlementMethod(PaymentMethod.BANK_TRANSFER)).not.toThrow();
  });

  it.each([PaymentMethod.CREDIT_CARD, PaymentMethod.CHEQUE, PaymentMethod.PROMISSORY_NOTE, PaymentMethod.OTHER])(
    "fails closed on %s pending Phase 10 instrument authority",
    (method) => {
      expect(() => assertSupportedSettlementMethod(method)).toThrow("Phase 10");
    },
  );
});

describe("assertPositiveAmount", () => {
  it("rejects zero, negative and non-finite amounts", () => {
    expect(() => assertPositiveAmount(0)).toThrow();
    expect(() => assertPositiveAmount(-5)).toThrow();
    expect(() => assertPositiveAmount(Number.NaN)).toThrow();
  });

  it("accepts a positive amount", () => {
    expect(() => assertPositiveAmount(1)).not.toThrow();
  });
});

describe("assertApplicationWithinSettlement", () => {
  it("accepts an application amount equal to its settlement amount", () => {
    expect(() => assertApplicationWithinSettlement(500, 500)).not.toThrow();
  });

  it("rejects an application amount that exceeds its settlement amount", () => {
    expect(() => assertApplicationWithinSettlement(500.01, 500)).toThrow(/exceeds its settlement amount/);
  });

  it("tolerates floating point rounding within epsilon", () => {
    expect(() => assertApplicationWithinSettlement(500.001, 500)).not.toThrow();
  });
});

describe("computeSettlementRequestHash", () => {
  const base = { paymentId: "payment-1", amount: 100, paymentMethod: PaymentMethod.CASH, financialAccountId: "account-1" };

  it("is deterministic for the same input", () => {
    const occurredAt = new Date("2026-08-30T10:00:00.000Z");
    expect(computeSettlementRequestHash({ ...base, occurredAt })).toBe(computeSettlementRequestHash({ ...base, occurredAt }));
  });

  it("produces the same hash across two calls that both omit occurredAt — the replay-authority-critical case", () => {
    // Regression: a naive implementation hashes `occurredAt ?? new Date()`,
    // which makes two calls (original + replay) that both omit occurredAt
    // hash to two different millisecond timestamps — silently breaking every
    // idempotency replay that doesn't pass an explicit occurredAt.
    const first = computeSettlementRequestHash({ ...base, occurredAt: undefined });
    const second = computeSettlementRequestHash({ ...base, occurredAt: undefined });
    expect(first).toBe(second);
  });

  it("changes when any hashed field changes", () => {
    const occurredAt = new Date("2026-08-30T10:00:00.000Z");
    const reference = computeSettlementRequestHash({ ...base, occurredAt });
    expect(computeSettlementRequestHash({ ...base, occurredAt, amount: 200 })).not.toBe(reference);
    expect(computeSettlementRequestHash({ ...base, occurredAt, financialAccountId: "account-2" })).not.toBe(reference);
    expect(computeSettlementRequestHash({ ...base, occurredAt: undefined })).not.toBe(reference);
  });
});
