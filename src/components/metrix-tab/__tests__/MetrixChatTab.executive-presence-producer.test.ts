import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../MetrixChatTab.tsx", import.meta.url)),
  "utf8",
);
const rootPageSource = readFileSync(
  fileURLToPath(new URL("../../../app/page.tsx", import.meta.url)),
  "utf8",
);
const previewPageSource = readFileSync(
  fileURLToPath(new URL("../../../app/metrix-preview/page.tsx", import.meta.url)),
  "utf8",
);
const metrixLayoutSource = readFileSync(
  fileURLToPath(new URL("../../../app/metrix/layout.tsx", import.meta.url)),
  "utf8",
);

describe("MetrixChatTab Executive Presence conversation producer", () => {
  it("uses only the context publish boundary", () => {
    expect(source).toContain("const { publishPresenceEvent } = useExecutivePresence()");
    expect(source).not.toMatch(/ExecutivePresence(?:EventBus|Engine|BehaviorAdapter)/);
    expect(source).not.toMatch(/createExecutivePresence(?:EventBus|Engine|BehaviorAdapter)/);
  });

  it("publishes thinking before extension resolution and the real chat request", () => {
    const startPublish = source.indexOf('type: "CONVERSATION_THINKING_STARTED"');
    const extensionResolution = source.indexOf("await executeActiveConversationExtension");
    const chatFetch = source.indexOf('fetch("/api/ai/chat"');

    expect(startPublish).toBeGreaterThan(-1);
    expect(extensionResolution).toBeGreaterThan(startPublish);
    expect(chatFetch).toBeGreaterThan(startPublish);
  });

  it("uses one correlation id for the thinking start and end pair", () => {
    expect(source.match(/const presenceCorrelationId = turn\.turnId/g)).toHaveLength(1);
    expect(source.match(/correlationId: presenceCorrelationId/g)).toHaveLength(4);
  });

  it("orders terminal thinking end before completed and error feedback", () => {
    const helperStart = source.indexOf("function endPresenceTurn(");
    const helperEnd = source.indexOf("\n    try {", helperStart);
    const helper = source.slice(helperStart, helperEnd);

    const thinkingEnded = helper.indexOf('type: "CONVERSATION_THINKING_ENDED"');
    expect(thinkingEnded).toBeGreaterThan(-1);
    expect(helper.indexOf('type: "FEEDBACK_COMPLETED"')).toBeGreaterThan(thinkingEnded);
    expect(helper.indexOf('type: "FEEDBACK_ERROR"')).toBeGreaterThan(thinkingEnded);
  });

  it("maps response, stream, done, abort, and exception outcomes", () => {
    expect(source).toMatch(
      /if \(!response\.ok \|\| !response\.body\) \{[\s\S]*?finishSubmit\("error"/,
    );
    expect(source).toMatch(
      /event\.type === "done"\) \{\s*finishSubmit\("completed"\)/,
    );
    expect(source).toMatch(
      /event\.type === "error"\) \{\s*finishSubmit\("error"/,
    );
    expect(source).toContain('isAbort ? "abort" : "error"');
    expect(source).toContain('if (outcome === "completed")');
    expect(source).toContain('else if (outcome === "error")');
  });

  it("keeps every production mount tree under a route-level runtime provider", () => {
    expect(rootPageSource).toMatch(
      /<ExecutivePresenceRuntimeProvider>\s*<MetrixOnboardingApp\s*\/>\s*<\/ExecutivePresenceRuntimeProvider>/,
    );
    expect(previewPageSource).toMatch(
      /<ExecutivePresenceRuntimeProvider>[\s\S]*<MetrixTabScreen\s*\/>[\s\S]*<\/ExecutivePresenceRuntimeProvider>/,
    );
    expect(metrixLayoutSource.match(/<ExecutivePresenceRuntimeProvider>/g)).toHaveLength(1);
  });
});
