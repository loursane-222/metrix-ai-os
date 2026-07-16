import { describe, expect, it } from "vitest";

import { validateInputAgainstSchema } from "../input-validator";
import type { ActionInputSchema } from "../../registry/action-registry.types";

describe("validateInputAgainstSchema", () => {
  it("passes when all required fields are present with correct types", () => {
    const schema: ActionInputSchema = {
      customerId: { type: "string", required: true },
      amount: { type: "number", required: true },
    };

    expect(validateInputAgainstSchema(schema, { customerId: "cust_1", amount: 100 })).toEqual([]);
  });

  it("reports a missing required field", () => {
    const schema: ActionInputSchema = { customerId: { type: "string", required: true } };

    expect(validateInputAgainstSchema(schema, {})).toEqual(["customerId is required."]);
  });

  it("does not flag an absent optional field", () => {
    const schema: ActionInputSchema = { note: { type: "string", required: false } };

    expect(validateInputAgainstSchema(schema, {})).toEqual([]);
  });

  it("reports a type mismatch for string fields", () => {
    const schema: ActionInputSchema = { customerId: { type: "string", required: true } };

    expect(validateInputAgainstSchema(schema, { customerId: 123 })).toEqual(["customerId must be a string."]);
  });

  it("reports a type mismatch for number fields", () => {
    const schema: ActionInputSchema = { amount: { type: "number", required: true } };

    expect(validateInputAgainstSchema(schema, { amount: "100" })).toEqual(["amount must be a number."]);
  });

  it("reports a type mismatch for boolean fields", () => {
    const schema: ActionInputSchema = { active: { type: "boolean", required: true } };

    expect(validateInputAgainstSchema(schema, { active: "yes" })).toEqual(["active must be a boolean."]);
  });

  it("validates enum membership", () => {
    const schema: ActionInputSchema = {
      tier: { type: "enum", required: true, enumValues: ["GOLD", "SILVER"] },
    };

    expect(validateInputAgainstSchema(schema, { tier: "BRONZE" })).toEqual(["tier must be one of: GOLD, SILVER."]);
    expect(validateInputAgainstSchema(schema, { tier: "GOLD" })).toEqual([]);
  });

  it("accepts any value for json fields", () => {
    const schema: ActionInputSchema = { value: { type: "json", required: true } };

    expect(validateInputAgainstSchema(schema, { value: { nested: [1, 2, 3] } })).toEqual([]);
  });
});
