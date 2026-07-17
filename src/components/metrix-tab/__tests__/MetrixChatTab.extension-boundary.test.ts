import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(new URL("../MetrixChatTab.tsx", import.meta.url));

describe("MetrixChatTab conversation extension boundary", () => {
  it("depends only on the generic dispatcher and not Customers command modules", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("executeActiveConversationExtension");
    expect(source).not.toMatch(/@\/lib\/customers\//);
    expect(source).not.toContain("customer-edit-command-integration");
    expect(source).not.toContain("customer-edit-command-contract");
    expect(source).not.toContain("customer-edit-surface-command-channel");
  });

  it("routes the shared written and voice send entry point through the generic dispatcher", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toMatch(/source: isVoice \? "voice" : "written"/);
    expect(source).toMatch(/extensionResult\.status !== "NOT_HANDLED"/);
  });
});
