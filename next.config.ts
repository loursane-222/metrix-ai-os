import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Physical-mic reality-gate root cause (confirmed via durable
  // LiveDiagnosticEvent evidence + node_modules/ws source read): Next's
  // server-side webpack bundling rewrites `openai`'s transitive
  // `require("bufferutil")` (an optional native addon `ws` tries and,
  // when absent, is supposed to silently fall back from — see
  // node_modules/ws/lib/buffer-util.js's own try/catch) into something
  // that no longer throws a catchable "module not found" at runtime.
  // The result: `ws`'s exported `mask` stays bound to a broken
  // `bufferUtil.mask`, which throws `TypeError: bufferUtil.mask is not
  // a function` on the *first* outbound WebSocket frame of 48+ bytes —
  // reproduced with a plain Node script confirming the same code works
  // correctly outside Next's bundler. Listing `openai` (and its `ws`
  // dependency) here makes Next load them via Node's own `require` at
  // runtime instead of bundling them, restoring `ws`'s intended
  // fallback behavior. This is a build/runtime configuration fix, not a
  // business-logic or Live-protocol change.
  serverExternalPackages: ["openai", "ws"]
};

export default nextConfig;
