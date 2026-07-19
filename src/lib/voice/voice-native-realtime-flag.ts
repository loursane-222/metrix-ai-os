// Single source of truth for the native realtime voice feature flag (Faz
// 1A.1 — "Native Voice Runtime"). Imported by both the server-side session
// route (voice/session/route.ts, decides create_response) and client-side
// hooks (useVoiceChatConnection.ts, useVoiceExperienceOrchestrator.ts,
// MetrixChatTab.tsx, decide event handling / HTTP exclusion) so the on/off
// decision can never diverge between server and client — a mismatch here
// would mean the server creates a response the client isn't listening for,
// or vice versa. Default is OFF (anything other than the literal string
// "true" keeps today's production behavior unchanged).
export function isVoiceNativeRealtimeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VOICE_NATIVE_REALTIME_ENABLED === "true";
}

// The exact decision MetrixChatTab.tsx's send() makes to decide whether the
// existing HTTP Voice V4 pipeline (fetch to /api/ai/chat, then TTS) should
// be skipped for this turn — the native realtime session generates and
// speaks the reply directly instead. Text-mode sends (isVoice: false) are
// never affected regardless of the flag. Extracted as its own function
// (rather than inlining `isVoice && isVoiceNativeRealtimeEnabled()` at the
// call site) purely so this specific decision is independently unit-testable
// without rendering the component.
export function shouldSkipHttpVoicePipeline(isVoice: boolean): boolean {
  return isVoice && isVoiceNativeRealtimeEnabled();
}

// Server VAD may keep its historical auto-interrupt behavior for the
// transcript-only HTTP/TTS path. Native mode deliberately delegates the
// interruption decision to the client, where transcript evidence can be
// checked against the assistant text before response.cancel is sent.
export function shouldServerAutoInterruptResponse(nativeRealtimeEnabled: boolean): boolean {
  return !nativeRealtimeEnabled;
}

import {
  resolveRealtimeVoice,
  type RealtimeVoice,
} from "./voice-preference-authority";

export type { RealtimeVoice } from "./voice-preference-authority";

// Pure — takes the raw candidate value as a parameter (rather than reading
// process.env internally) so it's independently unit-testable and so the
// normalization/allowlist logic has exactly one implementation regardless of
// where the raw value came from. Trims and lowercases before matching
// (production env values have been observed with stray whitespace/casing),
// then falls back to the safe default for anything empty, unset, or not in
// the allowlist — an arbitrary string is never forwarded to the provider.
export function resolveNativeRealtimeVoice(rawValue: string | undefined | null): RealtimeVoice {
  return resolveRealtimeVoice(rawValue);
}

// Faz 1A.2 — Voice Identity, selectable via env. Deliberately NOT a
// NEXT_PUBLIC_-prefixed name despite the task's suggested naming: Next.js
// inlines NEXT_PUBLIC_ values at BUILD time wherever they're referenced —
// this applies even in server-only route handlers like voice/session/route.ts,
// not only client bundles, since Next.js's webpack DefinePlugin substitution
// pass doesn't distinguish "will this specific reference ship to the
// browser" — it replaces every occurrence in the whole compiled graph. A
// NEXT_PUBLIC_ var here would mean changing it in Vercel requires a full
// rebuild+redeploy to take effect, defeating "seçilebilir via Vercel
// environment variable" for something meant to be tuned quickly (see Faz
// 1A.2's 4-candidate voice comparison). This value is never read by client
// code (the client never needs to know which voice string was chosen — only
// the server uses it when creating the realtime session), so there is no
// reason to expose it to the browser at all. Reuses the same
// CHAT_VOICE_REALTIME_VOICE name already introduced in Faz 1A.1
// Stabilization rather than adding a second, redundant env var.
export function resolveNativeRealtimeVoiceFromEnv(): RealtimeVoice {
  return resolveNativeRealtimeVoice(process.env.CHAT_VOICE_REALTIME_VOICE);
}
