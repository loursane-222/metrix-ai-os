import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const voice = readFileSync(new URL("../useVoiceChatConnection.ts", import.meta.url), "utf8");
const chat = readFileSync(new URL("../MetrixChatTab.tsx", import.meta.url), "utf8");
const ttsQueue = readFileSync(new URL("../useVoiceTtsQueue.ts", import.meta.url), "utf8");
const chatRoute = readFileSync(
  new URL("../../../app/api/ai/chat/route.ts", import.meta.url),
  "utf8",
);
const ttsRoute = readFileSync(
  new URL("../../../app/api/ai/chat/voice/tts/route.ts", import.meta.url),
  "utf8",
);

describe("voice/text runtime telemetry contract", () => {
  it("orders the complete voice startup timeline without changing connection operations", () => {
    const events = [
      "voice_start_requested", "cleanup_before_start", "remote_audio_unlock_attempt",
      "remote_audio_unlock_settled", "get_user_media_start",
      "get_user_media_done", "voice_session_api_start", "voice_session_api_done",
      "peer_connection_created", "local_track_added", "data_channel_created",
      "rtc_offer_create_start", "rtc_offer_create_done", "realtime_sdp_request_start",
      "realtime_sdp_request_done", "remote_description_set", "data_channel_open",
      "voice_ready_for_listening",
    ];
    for (const event of events) expect(voice).toContain(`"${event}"`);
    const startBody = voice.slice(voice.indexOf("const start = useCallback"));
    expect(startBody.indexOf('"get_user_media_start"')).toBeLessThan(startBody.indexOf(".getUserMedia({"));
    expect(startBody.indexOf('"rtc_offer_create_start"')).toBeLessThan(startBody.indexOf(".createOffer()"));
    const unlockStart = startBody.indexOf("beginNonBlockingAudioUnlock(remoteAudio");
    const mediaStart = startBody.indexOf('"get_user_media_start"');
    expect(unlockStart).toBeGreaterThan(-1);
    expect(unlockStart).toBeLessThan(mediaStart);
    expect(startBody.slice(0, mediaStart)).not.toContain("await remoteAudio.play()");
    expect(startBody).not.toMatch(/setTimeout\([^)]*remoteAudio\.play/u);
  });

  it("records playback evidence, barge-in decision and cancel lifecycle", () => {
    for (const field of [
      "assistantResponseActive", "assistantAudioPlaying", "activeResponseIdPresent",
      "timeSinceAssistantAudioStartedMs", "timeSinceLastAssistantTranscriptDeltaMs",
      "echoCancellationConfigured", "noiseSuppressionConfigured",
    ]) expect(voice).toContain(field);
    for (const event of [
      "voice_barge_in_decision", "response_cancel_requested",
      "response_cancel_sent", "response_cancel_failed",
    ]) expect(voice).toContain(`"${event}"`);
  });

  it("makes cleanup caller and destructive close operations observable", () => {
    for (const event of [
      "voice_cleanup_invoked", "mic_track_stop_requested",
      "data_channel_close_requested", "peer_connection_close_requested",
    ]) expect(voice).toContain(`"${event}"`);
    expect(voice.indexOf('"mic_track_stop_requested"')).toBeLessThan(voice.indexOf("track.stop()"));
  });

  it("logs transcript metadata but never transcript content", () => {
    expect(voice).toContain('"transcript_acceptance_evaluated"');
    expect(voice).toContain("lexicalCharacterCount");
    expect(voice).not.toContain("transcript delta:");
    expect(voice).not.toContain("transcript final:");
    expect(voice).not.toContain("transcript via item.created:");
  });

  it("propagates one client turn correlation through chat and TTS", () => {
    expect(chat).toContain('"X-Correlation-Id": turnCorrelationId');
    expect(chat).toContain('"X-Turn-Id": turn.turnId');
    expect(ttsQueue).toContain('"X-Correlation-Id": trace.correlationId');
    expect(ttsQueue).toContain('"X-Turn-Id": trace.turnId');
    expect(chatRoute).toContain('request.headers.get("X-Correlation-Id")');
    expect(ttsRoute).toContain('request.headers.get("X-Correlation-Id")');
  });

  it("exposes gateway and TTS first-byte milestones", () => {
    for (const event of [
      "provider_request_start", "first_upstream_chunk", "first_sse_chunk", "response_done",
    ]) expect(chatRoute).toContain(`"${event}"`);
    expect(ttsRoute).toContain('"tts_first_byte"');
    expect(ttsRoute).not.toMatch(/console\.(?:info|warn|error)\([^)]*\btext\b/u);
  });

  it("ties listening and speaking states to real browser lifecycle evidence", () => {
    expect(voice).toContain("isVoiceListeningReady({");
    expect(voice).toContain('readiness: "mic_live_peer_owned_data_channel_open"');
    expect(voice).toContain('"actual_remote_playback_started"');
    expect(voice).toContain("isActualRemotePlayback({");
    expect(voice).toContain('onRealtimeResponseLifecycle?.("audio_started")');
    expect(voice.indexOf("isActualRemotePlayback({")).toBeLessThan(
      voice.indexOf('onRealtimeResponseLifecycle?.("audio_started")'),
    );
  });

  it("keeps playback failure separate from session cleanup", () => {
    const playbackOwner = voice.slice(
      voice.indexOf("const attemptRemotePlayback = useCallback"),
      voice.indexOf("// Single entry point for every path"),
    );
    expect(playbackOwner).not.toContain("cleanup(");
    expect(playbackOwner).not.toContain("track.stop()");
    expect(playbackOwner).not.toContain("peerConnection.close()");
  });

  it("binds the owned remote track before the single playback authority runs", () => {
    const onTrack = voice.slice(
      voice.indexOf("peerConnection.ontrack ="),
      voice.indexOf("peerConnection.onconnectionstatechange"),
    );
    expect(onTrack).toContain("const remoteStream =");
    expect(onTrack).toContain("audio.srcObject = remoteStream");
    expect(onTrack).toContain('attemptRemotePlayback("remote_track"');
    expect(onTrack.indexOf("audio.srcObject = remoteStream")).toBeLessThan(
      onTrack.indexOf('attemptRemotePlayback("remote_track"'),
    );
  });

  it("deduplicates startup and generation-guards stale continuations", () => {
    expect(voice).toContain("if (startPromiseRef.current)");
    expect(voice).toContain('"duplicate_start_ignored"');
    expect(voice).toContain("assertActiveVoiceGeneration(generation, sessionGenerationRef.current)");
    expect(voice).toContain('"stale_cleanup_ignored"');
    expect(voice).toContain('"duplicate_cleanup_ignored"');
    expect(voice).toContain('reason: "connection_failed"');
    expect(voice).toContain('reason: "data_channel_closed"');
  });

  it("does not cleanup the session on normal response completion", () => {
    const responseDone = voice.slice(
      voice.indexOf('if (event.type === "response.done")'),
      voice.indexOf("// Fallback path for gpt-realtime-2"),
    );
    expect(responseDone).not.toContain("cleanup(");
    expect(responseDone).not.toContain("track.stop()");
    expect(responseDone).not.toContain("peerConnection.close()");
  });
});
