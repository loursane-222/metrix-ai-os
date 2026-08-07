import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Executive Mind Runtime Faz 1 boundaries", () => {
  it("does not participate in chat, gateway or prompt behavior", () => {
    const files = [
      "src/app/api/ai/chat/route.ts",
      "src/lib/ai/gateway/ai-gateway.ts",
      "src/lib/ai/prompts/prompt-format.ts",
      "src/lib/ai/prompts/prompt-renderer.ts",
    ];
    for (const file of files) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8"))
        .not.toContain("executive-mind-runtime");
    }
  });
});
