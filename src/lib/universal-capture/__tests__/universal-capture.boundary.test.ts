import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const root = join(process.cwd(), "src/lib/universal-capture");
function files(directory: string): string[] { return readdirSync(directory).flatMap((name) => { const path = join(directory, name); return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : []; }); }
describe("universal capture architectural boundaries", () => {
  it("keeps the core framework and persistence independent", () => { const production = files(root).filter((file) => !file.includes("/__tests__/")); for (const file of production) { const source = readFileSync(file, "utf8"); expect(source, relative(root, file)).not.toMatch(/from ["'](?:@prisma|next|react)/); expect(source, relative(root, file)).not.toMatch(/customers\/(?:customer.*service|customer.*repository)/); expect(source, relative(root, file)).not.toMatch(/action-runtime\/domains|customer-(?:create|update)-handler/); expect(source, relative(root, file)).not.toMatch(/PrismaClient|\.create\(|\.update\(|executeAction|execute\(/); } });
  it("contains no domain/source orchestration switch or duplicate runtime", () => { const source = files(root).filter((file) => !file.includes("/__tests__/")).map((file) => readFileSync(file, "utf8")).join("\n"); expect(source).not.toMatch(/switch\s*\(.*(?:source|module)/); expect(source).not.toMatch(/class\s+(?:DraftRuntime|ApprovalRuntime|ActionRuntime)/); expect(source).not.toContain("customer.create"); });
});
