import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { computeRequestHash, isIdempotencyKeyCollision } from "../idempotency";

describe("computeRequestHash", () => {
  it("is deterministic regardless of field insertion order", () => {
    const a = computeRequestHash({ customerId: "c-1", title: "Teklif", amount: 100 });
    const b = computeRequestHash({ amount: 100, title: "Teklif", customerId: "c-1" });

    expect(a).toBe(b);
  });

  it("produces a different hash when a meaningful field changes", () => {
    const a = computeRequestHash({ customerId: "c-1", title: "Teklif", amount: 100 });
    const b = computeRequestHash({ customerId: "c-1", title: "Teklif", amount: 200 });

    expect(a).not.toBe(b);
  });

  it("treats undefined and null the same way", () => {
    const a = computeRequestHash({ customerId: "c-1", personId: undefined });
    const b = computeRequestHash({ customerId: "c-1", personId: null });

    expect(a).toBe(b);
  });
});

describe("isIdempotencyKeyCollision", () => {
  it("returns true for a Prisma P2002 unique constraint error", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7.8.0",
    });

    expect(isIdempotencyKeyCollision(error)).toBe(true);
  });

  it("returns false for a different Prisma error code", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "7.8.0",
    });

    expect(isIdempotencyKeyCollision(error)).toBe(false);
  });

  it("returns false for a plain, unrelated error", () => {
    expect(isIdempotencyKeyCollision(new Error("network timeout"))).toBe(false);
  });
});
