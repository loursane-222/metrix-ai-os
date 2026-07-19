import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("surface authority boundaries", () => {
  it("keeps the generic core framework, DOM, route, module and persistence independent", () => { const source = ["contracts.ts", "registry.ts", "host.ts"].map((file) => readFileSync(resolve(process.cwd(), "src/lib/input-authority", file), "utf8")).join("\n"); for (const forbidden of ["querySelector", "getElementById", "HTMLElement", "HTMLInputElement", "from \"react\"", "from 'react'", "document.", "window.", "pathname", "Prisma", "repository", "@/lib/customers", "@/lib/products"]) expect(source).not.toContain(forbidden); });
});
