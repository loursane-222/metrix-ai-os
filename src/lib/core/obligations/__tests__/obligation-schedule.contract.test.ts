import { describe, expect, it } from "vitest";
import { assertMaterializableExpenseStatus, assertMaterializableInvoiceStatus, trivialTermFromDueDate } from "../obligation-schedule.contract";

describe("trivialTermFromDueDate", () => {
  it("synthesizes an IMMEDIATE single-component term when there is no dueDate", () => {
    const term = trivialTermFromDueDate(null);
    expect(term.components).toEqual([{ allocationType: "REMAINDER", maturityBasis: "IMMEDIATE" }]);
  });

  it("synthesizes a FIXED_DATE single-component term from an existing dueDate", () => {
    const term = trivialTermFromDueDate(new Date("2026-09-30T00:00:00.000Z"));
    expect(term.components).toEqual([{ allocationType: "REMAINDER", maturityBasis: "FIXED_DATE", dueDate: "2026-09-30" }]);
  });
});

describe("assertMaterializableInvoiceStatus", () => {
  it("rejects DRAFT and CANCELLED", () => {
    expect(() => assertMaterializableInvoiceStatus("DRAFT")).toThrow();
    expect(() => assertMaterializableInvoiceStatus("CANCELLED")).toThrow();
  });
  it("accepts SENT and PAID", () => {
    expect(() => assertMaterializableInvoiceStatus("SENT")).not.toThrow();
    expect(() => assertMaterializableInvoiceStatus("PAID")).not.toThrow();
  });
});

describe("assertMaterializableExpenseStatus", () => {
  it("rejects CANCELLED", () => {
    expect(() => assertMaterializableExpenseStatus("CANCELLED")).toThrow();
  });
  it("accepts PENDING/PARTIALLY_PAID/PAID", () => {
    expect(() => assertMaterializableExpenseStatus("PENDING")).not.toThrow();
    expect(() => assertMaterializableExpenseStatus("PARTIALLY_PAID")).not.toThrow();
    expect(() => assertMaterializableExpenseStatus("PAID")).not.toThrow();
  });
});
