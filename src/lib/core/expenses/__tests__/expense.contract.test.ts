import { describe, expect, it } from "vitest";
import { assertNetTaxMatchesTotal, assertNonEmpty, assertPositiveAmount } from "../expense.contract";

describe("assertNonEmpty", () => {
  it("rejects empty/whitespace/undefined", () => {
    expect(() => assertNonEmpty(undefined, "title")).toThrow();
    expect(() => assertNonEmpty("  ", "title")).toThrow();
  });
  it("accepts a non-empty string", () => {
    expect(() => assertNonEmpty("Ofis kirası", "title")).not.toThrow();
  });
});

describe("assertPositiveAmount", () => {
  it("rejects zero, negative and non-finite amounts", () => {
    expect(() => assertPositiveAmount(0)).toThrow();
    expect(() => assertPositiveAmount(-1)).toThrow();
    expect(() => assertPositiveAmount(Number.NaN)).toThrow();
  });
});

describe("assertNetTaxMatchesTotal", () => {
  it("allows amount alone with no breakdown", () => {
    expect(() => assertNetTaxMatchesTotal({ amount: 1000 })).not.toThrow();
  });
  it("requires both netAmount and taxAmount together", () => {
    expect(() => assertNetTaxMatchesTotal({ amount: 1000, netAmount: 800 })).toThrow();
    expect(() => assertNetTaxMatchesTotal({ amount: 1000, taxAmount: 200 })).toThrow();
  });
  it("rejects a breakdown that does not sum to amount", () => {
    expect(() => assertNetTaxMatchesTotal({ amount: 1000, netAmount: 800, taxAmount: 100 })).toThrow();
  });
  it("accepts a breakdown that sums to amount", () => {
    expect(() => assertNetTaxMatchesTotal({ amount: 1000, netAmount: 800, taxAmount: 200 })).not.toThrow();
  });
});
