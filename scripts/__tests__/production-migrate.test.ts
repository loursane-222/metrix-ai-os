import { describe, expect, it, vi } from "vitest";
import { runProductionMigration } from "../production-migrate.mjs";

describe("production migration build guard", () => {
  it("does not invoke Prisma outside Vercel", () => {
    const runMigration = vi.fn();
    expect(runProductionMigration({ env: { NODE_ENV: "test" }, runMigration, log: vi.fn() })).toBe("skipped");
    expect(runMigration).not.toHaveBeenCalled();
  });

  it("does not invoke Prisma in Preview", () => {
    const runMigration = vi.fn();
    expect(runProductionMigration({ env: { NODE_ENV: "test", VERCEL_ENV: "preview" }, runMigration, log: vi.fn() })).toBe("skipped");
    expect(runMigration).not.toHaveBeenCalled();
  });

  it("fails safely when production DIRECT_URL is missing", () => {
    const runMigration = vi.fn();
    expect(() => runProductionMigration({ env: { NODE_ENV: "production", VERCEL_ENV: "production" }, runMigration, log: vi.fn() }))
      .toThrow("DIRECT_URL is required for production migrations");
    expect(runMigration).not.toHaveBeenCalled();
  });

  it("invokes Prisma once in production when DIRECT_URL exists", () => {
    const runMigration = vi.fn();
    expect(runProductionMigration({ env: { NODE_ENV: "production", VERCEL_ENV: "production", DIRECT_URL: "secret" }, runMigration, log: vi.fn() })).toBe("applied");
    expect(runMigration).toHaveBeenCalledOnce();
  });
});
