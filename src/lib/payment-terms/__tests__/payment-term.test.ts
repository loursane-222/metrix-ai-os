import { describe, expect, it } from "vitest";
import { formatPaymentTerm, materializePaymentTerm, parseStructuredPaymentTerm, parseTurkishPaymentTerm, resolvePaymentTermPrecedence, validatePaymentTermForDocument } from "../index";

const pct = (percentageBasisPoints: number, days?: number) => ({ allocationType: "PERCENTAGE", percentageBasisPoints, ...(days === undefined ? { maturityBasis: "IMMEDIATE" } : { maturityBasis: "DAYS_AFTER_REFERENCE", days, referenceDateType: "INVOICE_DATE" }) });
const term = (components: unknown[]) => ({ schemaVersion: 1, strategy: "SCHEDULE", components });

describe("canonical structured payment terms", () => {
  it.each([
    ["100% immediate", term([pct(10_000)])],
    ["100% 30 days", term([pct(10_000, 30)])],
    ["50/50", term([pct(5000), pct(5000, 30)])],
    ["30/40/30", term([pct(3000), pct(4000, 30), pct(3000, 60)])],
    ["equal installments", term([pct(3333, 30), pct(3333, 60), pct(3334, 90)])],
    ["fixed plus remainder", term([{ allocationType: "FIXED_AMOUNT", amountCents: "5000000", currency: "TRY", maturityBasis: "IMMEDIATE" }, { allocationType: "REMAINDER", maturityBasis: "DAYS_AFTER_REFERENCE", days: 60, referenceDateType: "INVOICE_DATE" }])],
    ["fixed date", term([{ allocationType: "PERCENTAGE", percentageBasisPoints: 10_000, maturityBasis: "FIXED_DATE", dueDate: "2026-10-15" }])],
  ])("accepts %s", (_label, value) => expect(parseStructuredPaymentTerm(value).components.length).toBeGreaterThan(0));

  it.each([
    ["90 percent", term([pct(9000)])],
    ["110 percent", term([{ ...pct(10_000), percentageBasisPoints: 11_000 }])],
    ["negative percent", term([{ ...pct(10_000), percentageBasisPoints: -1 }])],
    ["negative amount", term([{ allocationType: "FIXED_AMOUNT", amountCents: "-1", currency: "TRY", maturityBasis: "IMMEDIATE" }, { allocationType: "REMAINDER", maturityBasis: "IMMEDIATE" }])],
    ["multiple remainder", term([{ allocationType: "REMAINDER", maturityBasis: "IMMEDIATE" }, { allocationType: "REMAINDER", maturityBasis: "FIXED_DATE", dueDate: "2026-10-15" }])],
    ["duplicate", term([pct(5000), pct(5000)])],
  ])("rejects %s", (_label, value) => expect(() => parseStructuredPaymentTerm(value)).toThrow());

  it("rejects an impossible fixed calendar date", () => {
    expect(() => parseStructuredPaymentTerm(term([{ allocationType: "PERCENTAGE", percentageBasisPoints: 10_000, maturityBasis: "FIXED_DATE", dueDate: "2026-02-30" }]))).toThrow();
  });

  it("rejects fixed amounts above total and cross-currency", () => {
    const fixed = parseStructuredPaymentTerm(term([{ allocationType: "FIXED_AMOUNT", amountCents: "5000001", currency: "TRY", maturityBasis: "IMMEDIATE" }, { allocationType: "REMAINDER", maturityBasis: "IMMEDIATE" }]));
    expect(() => validatePaymentTermForDocument(fixed, BigInt(5_000_000), "TRY")).toThrow(/exceed/);
    expect(() => validatePaymentTermForDocument(fixed, BigInt(6_000_000), "USD")).toThrow(/cross-currency/);
  });

  it("materializes exact cents and reconciles the final installment", () => {
    const parsed = parseStructuredPaymentTerm(term([pct(3333, 30), pct(3333, 60), pct(3334, 90)]));
    const rows = materializePaymentTerm({ term: parsed, totalCents: BigInt(10_000), currency: "TRY", references: { INVOICE_DATE: new Date("2026-01-01T00:00:00.000Z") } });
    expect(rows.map((row) => row.amountCents)).toEqual(["3333", "3333", "3334"]);
    expect(rows.map((row) => row.dueDate)).toEqual(["2026-01-31", "2026-03-02", "2026-04-01"]);
  });

  it("rejects a fixed date before the available reference date", () => {
    const parsed = parseStructuredPaymentTerm(term([{ allocationType: "PERCENTAGE", percentageBasisPoints: 10_000, maturityBasis: "FIXED_DATE", dueDate: "2026-01-01" }]));
    expect(() => materializePaymentTerm({ term: parsed, totalCents: BigInt(100), currency: "TRY", references: { QUOTE_DATE: new Date("2026-02-01T00:00:00.000Z") } })).toThrow(/precede/);
  });

  it.each(["peşin", "30 gün vadeli", "60 gün vade", "%50 peşin, kalanı 30 gün", "%30 peşin, %40 30 gün, %30 60 gün", "3 eşit taksit 30-60-90 gün"])("parses Turkish business language: %s", (text) => expect(parseTurkishPaymentTerm(text).status).toBe("PARSED"));
  it("keeps cash method semantics separate from maturity", () => {
    expect(parseTurkishPaymentTerm("peşin")).toMatchObject({ status: "PARSED", term: { components: [{ maturityBasis: "IMMEDIATE" }] } });
    expect(parseTurkishPaymentTerm("nakit").status).toBe("CLARIFICATION_REQUIRED");
    expect(parseTurkishPaymentTerm("30 gün sonra nakit")).toMatchObject({ status: "PARSED", term: { components: [{ maturityBasis: "DAYS_AFTER_REFERENCE", days: 30 }] } });
  });
  it("clarifies cadence-free installments", () => expect(parseTurkishPaymentTerm("3 taksit").status).toBe("CLARIFICATION_REQUIRED"));
  it("does not invent missing remainder maturity or incomplete schedules", () => {
    expect(parseTurkishPaymentTerm("50 bin şimdi kalanı sonra").status).not.toBe("PARSED");
    expect(parseTurkishPaymentTerm("%50 peşin").status).not.toBe("PARSED");
  });
  it("formats from structure rather than using display text as authority", () => expect(formatPaymentTerm(parseStructuredPaymentTerm(term([pct(5000), pct(5000, 30)])))).toContain("%50 peşin"));
  it("formats fixed minor units deterministically", () => expect(formatPaymentTerm(parseStructuredPaymentTerm(term([{ allocationType: "FIXED_AMOUNT", amountCents: "5000000", currency: "TRY", maturityBasis: "IMMEDIATE" }, { allocationType: "REMAINDER", maturityBasis: "DAYS_AFTER_REFERENCE", days: 60, referenceDateType: "INVOICE_DATE" }])))).toContain("50.000 TRY"));

  it("uses explicit transaction terms before customer defaults during creation", () => {
    const explicit = term([pct(10_000, 60)]);
    const resolved = resolvePaymentTermPrecedence({ explicitTransactionTerm: explicit, customerDefaultDays: 15 });
    expect(resolved?.components).toEqual(parseStructuredPaymentTerm(explicit).components);
  });

  it("uses customer defaults only when transaction terms are absent", () => {
    expect(resolvePaymentTermPrecedence({ customerDefaultDays: 30 })?.components[0]).toMatchObject({ percentageBasisPoints: 10_000, days: 30 });
  });

  it("keeps legacy free text outside the structured authority", () => {
    const legacyQuote = { paymentTerm: "Özel eski anlaşma", paymentTermStructured: null };
    expect(legacyQuote.paymentTerm).toBe("Özel eski anlaşma");
    expect(resolvePaymentTermPrecedence({})).toBeUndefined();
  });
});
