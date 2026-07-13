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

// Faz 1A.1 Stabilization — Voice Identity. Lives here (not in
// voice/session/route.ts) because a Next.js route module may only export
// its HTTP method handlers and a small fixed set of special names — an
// arbitrary helper export there fails the framework's own route-module type
// check. See voice/session/route.ts's own comment for why "cedar" (not the
// production TTS path's "onyx", which the Realtime API's voice type doesn't
// accept at all) is the value here.
const DEFAULT_NATIVE_REALTIME_VOICE = "cedar";

export function resolveNativeRealtimeVoice(): string {
  return process.env.CHAT_VOICE_REALTIME_VOICE ?? DEFAULT_NATIVE_REALTIME_VOICE;
}
