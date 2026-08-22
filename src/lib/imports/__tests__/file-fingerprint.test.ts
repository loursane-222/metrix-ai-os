import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ businessCandidate: { findFirst: vi.fn() } }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));
import { hashFileContent, findPriorFileImport } from "../file-fingerprint";

describe("hashFileContent", () => {
  it("produces a stable hash for identical content", () => {
    const a = hashFileContent(Buffer.from("hello"));
    const b = hashFileContent(Buffer.from("hello"));
    expect(a).toBe(b);
  });

  it("produces different hashes for different content", () => {
    expect(hashFileContent(Buffer.from("hello"))).not.toBe(hashFileContent(Buffer.from("world")));
  });
});

describe("findPriorFileImport", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns null when no prior candidate matches the file hash", async () => {
    db.businessCandidate.findFirst.mockResolvedValue(null);
    const result = await findPriorFileImport("org-1", "Payment", "abc123");
    expect(result).toBeNull();
  });

  it("returns the prior candidate's creation timestamp when a match is found", async () => {
    const createdAt = new Date("2026-08-20T10:00:00Z");
    db.businessCandidate.findFirst.mockResolvedValue({ createdAt });
    const result = await findPriorFileImport("org-1", "Payment", "abc123");
    expect(result).toBe(createdAt.toISOString());
    expect(db.businessCandidate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: "org-1",
        targetDomain: "Payment",
        provenanceJson: { path: ["fileHash"], equals: "abc123" },
      }),
    }));
  });
});
