import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Source-contract test, same style as single-authority-source-contract.test.ts.
// Proves the mid-stream SSE "error" event — the one path in the chat
// pipeline that used to forward a raw caught exception's .message straight
// to the client — now only ever emits the governed, Executive-voiced
// fallback text, and that the raw exception is captured server-side only
// (tagged with requestId) for diagnostics.
const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

describe("chat route — no raw exception leak contract", () => {
  it("never puts a caught exception's own .message into the SSE error payload", () => {
    expect(routeSource).not.toMatch(/type:\s*"error",\s*message:\s*err/);
    expect(routeSource).not.toContain('err instanceof Error ? err.message : "Unknown error"');
  });

  it("routes the SSE error payload through the canonical Executive fallback authority", () => {
    expect(routeSource).toMatch(/type:\s*"error",\s*message:\s*buildExecutiveFallbackResponse\(/);
    expect(routeSource).toContain('import { buildExecutiveFallbackResponse');
  });

  it("still records the raw exception server-side, tagged with requestId, for diagnostics", () => {
    expect(routeSource).toMatch(/logChatLatency\(requestId, requestStartAt, "stream_error"/);
    expect(routeSource).toMatch(/errorMessage:\s*err instanceof Error \? err\.message : String\(err\)/);
  });
});
