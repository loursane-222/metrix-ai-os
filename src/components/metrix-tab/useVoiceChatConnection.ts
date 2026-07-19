"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { VoiceRealtimeSessionResponse } from "@/lib/onboarding/voice/realtime-session.types";
import { isVoiceNativeRealtimeEnabled } from "@/lib/voice/voice-native-realtime-flag";

// Diagnostic-only: mirrors into the same page-lifetime [VoiceLatency] array
// used by useVoiceExperienceOrchestrator.ts and useVoiceTtsQueue.ts (see
// their identical comment). This file has no access to either's turn clock,
// so it logs a bare timestamp only — cross-file correlation happens via the
// shared `at` (performance.now()) value, not a shared numeric id. Timing and
// numeric identifiers only — never transcript text.
type VoiceLatencyPayload = Record<string, number | string | boolean | undefined>;

declare global {
  interface Window {
    __voiceLatencyLogs?: VoiceLatencyPayload[];
  }
}

if (typeof window !== "undefined" && !window.__voiceLatencyLogs) {
  window.__voiceLatencyLogs = [];
}

function logVoiceLatency(payload: VoiceLatencyPayload): void {
  console.info("[VoiceLatency]", payload);
  if (typeof window !== "undefined") {
    window.__voiceLatencyLogs?.push(payload);
  }
}

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string } };

type DataChannelState = "idle" | "connecting" | "open" | "closed" | "error";

const CONNECT_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MESSAGE =
  "Ses bağlantısı kurulamadı. Mikrofon izni var ama canlı bağlantı açılamadı.";

type UseVoiceChatConnectionResult = {
  isConnected: boolean;
  isInputMuted: boolean;
  transcript: string;
  connectionState: RTCPeerConnectionState | "idle";
  iceConnectionState: RTCIceConnectionState | "idle";
  dataChannelState: DataChannelState;
  connectionError: string | null;
  start: () => Promise<void>;
  stop: () => void;
  muteInput: () => void;
  unmuteInput: () => void;
  createResponse: () => void;
  // Faz 1A.1 — Native Voice Runtime. Sends response.cancel (only if a
  // response id is actually owned — see activeResponseIdRef) and pauses
  // (never destroys) the remote assistant-audio element. No-op when the
  // native realtime flag is off.
  cancelActiveResponse: () => void;
};

// Faz 1A.1 — Native Voice Runtime. Optional fourth argument, additive to the
// three existing callbacks above: when the native realtime flag is on, the
// realtime session itself generates the assistant's spoken reply instead of
// the existing HTTP Voice V4 pipeline, and these are how that reply's text
// and lifecycle reach the caller. All three are no-ops (never invoked) when
// the flag is off, matching the "today's behavior unchanged" requirement —
// see handleRealtimeEvent's response.* branches, which only ever fire when
// the server actually creates a response.
type NativeRealtimeCallbacks = {
  onAssistantTranscriptDelta?: (delta: string) => void;
  onAssistantTranscriptDone?: (finalText: string) => void;
  onRealtimeResponseLifecycle?: (
    phase: "started" | "audio_started" | "audio_done" | "audio_stopped" | "done",
    status?: string,
  ) => void;
};

const VOICE_SESSION_URL = "/api/ai/chat/voice/session";
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export function useVoiceChatConnection(
  onFinalTranscript?: (text: string) => void,
  onSpeechStarted?: () => void,
  onInterimTranscript?: (text: string) => void,
  nativeRealtimeCallbacks?: NativeRealtimeCallbacks,
): UseVoiceChatConnectionResult {
  const { onAssistantTranscriptDelta, onAssistantTranscriptDone, onRealtimeResponseLifecycle } =
    nativeRealtimeCallbacks ?? {};
  const [isConnected, setIsConnected] = useState(false);
  const [isInputMuted, setIsInputMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | "idle">("idle");
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState | "idle">("idle");
  const [dataChannelState, setDataChannelState] = useState<DataChannelState>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveTranscriptRef = useRef("");
  const transcriptTurnRef = useRef(createTranscriptTurnOwner());
  const speechStoppedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Faz 1A.1 — Native Voice Runtime.
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  // The single active response authority. Server events are allowed to mutate
  // assistant UI/lifecycle state only when their response id matches this id.
  const activeResponseIdRef = useRef<string | null>(null);
  // Accumulates response.output_audio_transcript.delta chunks so the
  // "done" event has a fallback full transcript if it doesn't itself carry
  // one — same fallback pattern as liveTranscriptRef for user transcripts.
  const assistantTranscriptBufferRef = useRef("");
  // Diagnostic-only: first assistant-transcript-delta-per-turn marker, reset
  // on every response.created.
  const hasLoggedFirstAssistantDeltaRef = useRef(false);
  // Faz 1A.2. Reset on every response.created (see that branch below).
  const lastAssistantDeltaEventIdRef = useRef<string | undefined>(undefined);

  const clearSpeechStoppedTimer = useCallback(() => {
    if (speechStoppedTimerRef.current !== null) {
      clearTimeout(speechStoppedTimerRef.current);
      speechStoppedTimerRef.current = null;
    }
  }, []);

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearSpeechStoppedTimer();
    clearConnectTimeout();

    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    // Faz 1A.1: tear down the remote assistant-audio element. Pausing first
    // is not strictly required before clearing srcObject, but keeps the
    // ordering explicit about intent (stop, then detach).
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
    activeResponseIdRef.current = null;
    assistantTranscriptBufferRef.current = "";
  }, [clearSpeechStoppedTimer, clearConnectTimeout]);

  // Faz 1A.1 — Native Voice Runtime. Barge-in cancel: sends response.cancel
  // only while a response id is actually owned, then
  // pauses (never destroys) the remote audio element — a live WebRTC track
  // has no backlog to flush, so pause() alone is sufficient to silence it
  // without losing the connection or requiring a fresh negotiation.
  const cancelActiveResponse = useCallback(() => {
    const responseId = activeResponseIdRef.current;
    if (!shouldSendResponseCancel(responseId)) {
      return;
    }

    const channel = dataChannelRef.current;
    if (channel?.readyState === "open") {
      try {
        channel.send(JSON.stringify({ type: "response.cancel", response_id: responseId }));
        logVoiceLatency({ label: "native_realtime_cancel_sent", at: performance.now() });
      } catch {
        // Cancel send failed — local playback is still paused below.
      }
    }
    activeResponseIdRef.current = null;
    remoteAudioRef.current?.pause();
  }, []);

  const createResponse = useCallback(() => {
    if (sendRealtimeResponseCreate(dataChannelRef.current, isVoiceNativeRealtimeEnabled())) {
      logVoiceLatency({ label: "native_realtime_response_create_sent", at: performance.now() });
    }
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setIsConnected(false);
    setIsInputMuted(false);
    setTranscript("");
    setConnectionState("idle");
    setIceConnectionState("idle");
    setDataChannelState("idle");
  }, [cleanup]);

  // Central point for all input-mute control. isInputMuted is a UI-state
  // signal only — the audio track stays enabled even while "muted" so the
  // realtime API keeps receiving audio and can emit speech_started while
  // Metrix is speaking. That event is how the voice orchestrator implements
  // live barge-in (see onSpeechStarted below). Hard-disabling the track here
  // would make barge-in impossible: a disabled track sends silence, so the
  // server could never detect the user starting to talk.
  const setInputMuted = useCallback((muted: boolean) => {
    if (muted && dataChannelRef.current?.readyState === "open") {
      try {
        dataChannelRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
      } catch {
        // Buffer clear failed — UI mute state still applies, session continues.
      }
    }
    setIsInputMuted(muted);
  }, []);

  const muteInput = useCallback(() => setInputMuted(true), [setInputMuted]);
  const unmuteInput = useCallback(() => setInputMuted(false), [setInputMuted]);

  // Single entry point for every path that can produce a final user
  // transcript (transcription.completed, conversation.item.created,
  // speech_stopped fallback timer). The first path with a non-empty final
  // transcript owns the turn; every later path for that turn becomes a no-op.
  const submitFinalTranscript = useCallback(
    (rawText: string, turnOwner = transcriptTurnRef.current) => {
      const finalTranscript = claimTranscriptTurn(turnOwner, rawText);
      if (finalTranscript === null) {
        return;
      }

      clearSpeechStoppedTimer();
      liveTranscriptRef.current = "";
      onFinalTranscript?.(finalTranscript);
      muteInput();
    },
    [clearSpeechStoppedTimer, onFinalTranscript, muteInput],
  );

  const handleRealtimeEvent = useCallback((event: unknown) => {
    if (!isRecord(event) || typeof event.type !== "string") {
      return;
    }

    // Temporary diagnostic: log every realtime event type so production
    // issues (no events at all vs. wrong event names) are visible in console.
    console.info("[VoiceChatConnection][diag] realtime event:", event.type);

    if (event.type === "input_audio_buffer.speech_started") {
      clearSpeechStoppedTimer();
      liveTranscriptRef.current = "";
      transcriptTurnRef.current = createTranscriptTurnOwner();
      onSpeechStarted?.();
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      // gpt-realtime-2 does not always emit
      // conversation.item.input_audio_transcription.completed. If neither
      // that event nor conversation.item.created resolves the turn within
      // 1200ms, submit whatever we accumulated from delta events.
      logVoiceLatency({ label: "speech_stopped", at: performance.now() });
      clearSpeechStoppedTimer();
      const turnOwner = transcriptTurnRef.current;
      speechStoppedTimerRef.current = setTimeout(() => {
        speechStoppedTimerRef.current = null;
        submitFinalTranscript(liveTranscriptRef.current, turnOwner);
      }, 1200);
      return;
    }

    if (isTranscriptDeltaEvent(event.type)) {
      const delta = readTranscriptString(event, ["delta", "partial", "transcript"]);
      if (delta) {
        liveTranscriptRef.current = normalizeMetrixNameInTranscript(
          `${liveTranscriptRef.current}${delta}`,
        );
        setTranscript(liveTranscriptRef.current);
        console.debug("[VoiceChatConnection] transcript delta:", delta);
        onInterimTranscript?.(liveTranscriptRef.current);
      }
      return;
    }

    if (isTranscriptCompletedEvent(event.type)) {
      const finalTranscript = normalizeMetrixNameInTranscript(
        readTranscriptString(event, ["transcript", "text"]) || liveTranscriptRef.current,
      );
      setTranscript(finalTranscript);
      console.debug("[VoiceChatConnection] transcript final:", finalTranscript);
      submitFinalTranscript(finalTranscript);
      return;
    }

    // Native Voice Runtime. The client requests this response only after the
    // orchestrator accepts a final transcript.
    if (event.type === "response.created") {
      const responseId = readRealtimeResponseId(event);
      if (!responseId) return;
      activeResponseIdRef.current = responseId;
      assistantTranscriptBufferRef.current = "";
      hasLoggedFirstAssistantDeltaRef.current = false;
      lastAssistantDeltaEventIdRef.current = undefined;
      logVoiceLatency({ label: "native_realtime_response_created", at: performance.now() });
      logVoiceLatency({ label: "native_realtime_response_owned", at: performance.now() });
      onRealtimeResponseLifecycle?.("started");
      return;
    }

    // Exact event name verified against the installed openai SDK's realtime
    // event types (node_modules/openai/resources/realtime/realtime.d.ts):
    // response.output_audio_transcript.delta/done — NOT
    // response.audio_transcript.delta/done, which is what the (currently
    // dormant) onboarding voice controller assumes. That naming is stale
    // for the SDK version this repo has installed.
    if (event.type === "response.output_audio_transcript.delta") {
      if (!isOwnedRealtimeResponseEvent(event, activeResponseIdRef.current)) {
        logVoiceLatency({ label: "native_realtime_stale_event_ignored", at: performance.now() });
        return;
      }
      // Faz 1A.2 — each delta event carries a unique event_id (SDK type
      // ResponseAudioTranscriptDeltaEvent.event_id) — defensive dedup
      // against a redundant re-dispatch of the exact same event (e.g. a
      // data-channel/React double-invoke quirk), not an expected normal
      // occurrence over WebRTC's reliable-ordered data channel.
      const eventId = typeof event.event_id === "string" ? event.event_id : undefined;
      if (isDuplicateRealtimeEvent(eventId, lastAssistantDeltaEventIdRef.current)) {
        return;
      }
      lastAssistantDeltaEventIdRef.current = eventId;

      const delta = readTranscriptString(event, ["delta"]);
      if (delta) {
        assistantTranscriptBufferRef.current = accumulateTranscriptDelta(
          assistantTranscriptBufferRef.current,
          delta,
        );
        if (!hasLoggedFirstAssistantDeltaRef.current) {
          hasLoggedFirstAssistantDeltaRef.current = true;
          logVoiceLatency({ label: "native_realtime_first_assistant_transcript_delta", at: performance.now() });
        }
        onAssistantTranscriptDelta?.(delta);
      }
      return;
    }

    if (event.type === "response.output_audio_transcript.done") {
      if (!isOwnedRealtimeResponseEvent(event, activeResponseIdRef.current)) {
        logVoiceLatency({ label: "native_realtime_stale_event_ignored", at: performance.now() });
        return;
      }
      const finalText = resolveFinalAssistantTranscript(
        assistantTranscriptBufferRef.current,
        readTranscriptString(event, ["transcript", "text"]),
      );
      assistantTranscriptBufferRef.current = finalText;
      onAssistantTranscriptDone?.(finalText);
      return;
    }

    // response.output_audio.delta (raw audio bytes, base64) is intentionally
    // not handled: over WebRTC transport the actual assistant audio arrives
    // via the negotiated media track (see peerConnection.ontrack in start()
    // below), not this data-channel event. Decoding/playing from both would
    // risk double audio. response.output_audio.done is forwarded as an
    // ordering signal only; response.done below remains the authoritative
    // terminal event ("Always emitted, no matter the final state").
    if (event.type === "response.output_audio.delta") {
      return;
    }

    if (event.type === "response.output_audio.done") {
      if (!isOwnedRealtimeResponseEvent(event, activeResponseIdRef.current)) return;
      onRealtimeResponseLifecycle?.("audio_done");
      return;
    }

    if (event.type === "output_audio_buffer.started") {
      if (!isOwnedRealtimeResponseEvent(event, activeResponseIdRef.current)) return;
      onRealtimeResponseLifecycle?.("audio_started");
      return;
    }

    if (event.type === "output_audio_buffer.stopped") {
      if (!isOwnedRealtimeResponseEvent(event, activeResponseIdRef.current)) return;
      onRealtimeResponseLifecycle?.("audio_stopped");
      return;
    }

    if (event.type === "response.done") {
      const responseId = readRealtimeResponseId(event);
      const wasActive = isOwnedResponseId(responseId, activeResponseIdRef.current);
      if (!wasActive) {
        logVoiceLatency({ label: "native_realtime_stale_event_ignored", at: performance.now() });
        return;
      }
      activeResponseIdRef.current = null;
      const response = isRecord(event.response) ? event.response : null;
      const status = typeof response?.status === "string" ? response.status : undefined;
      logVoiceLatency({ label: "native_realtime_response_done", at: performance.now(), status });
      // Faz 1A.1 Stabilization — "completed" and "cancelled" (a normal
      // barge-in outcome — see cancelActiveResponse) are both NORMAL, not
      // errors. "failed" is a response-level generation failure: recoverable
      // per the same "most errors are recoverable" principle the SDK's own
      // RealtimeErrorEvent doc comment states for the parallel case — the
      // session/connection is not touched, only this one response failed.
      // Diagnostic-only, flag-gated, no secrets/audio payload.
      if (shouldReportFailedResponseStatus(status) && isVoiceNativeRealtimeEnabled()) {
        console.warn("[NativeRealtimeError]", {
          source: "response.done",
          responseId: typeof response?.id === "string" ? response.id : undefined,
          status,
          statusDetails: response?.status_details,
          hasActiveResponse: wasActive,
          dataChannelReadyState: dataChannelRef.current?.readyState,
          connectionState: peerConnectionRef.current?.connectionState,
          timestamp: new Date().toISOString(),
        });
      }
      if (wasActive) {
        onRealtimeResponseLifecycle?.("done", status);
      }
      return;
    }

    // Fallback path for gpt-realtime-2: the user transcript arrives as part
    // of the created conversation item instead of a dedicated completed event.
    if (event.type === "conversation.item.created") {
      const item = event.item;
      if (
        isRecord(item) &&
        item.role === "user" &&
        item.type === "message" &&
        Array.isArray(item.content)
      ) {
        for (const part of item.content as unknown[]) {
          if (
            isRecord(part) &&
            part.type === "input_audio" &&
            typeof part.transcript === "string" &&
            part.transcript.trim()
          ) {
            const normalizedTranscript = normalizeMetrixNameInTranscript(part.transcript);
            setTranscript(normalizedTranscript);
            console.debug("[VoiceChatConnection] transcript via item.created:", normalizedTranscript);
            submitFinalTranscript(normalizedTranscript);
            break;
          }
        }
      }
      return;
    }

    if (event.type === "error") {
      // Flag-off behavior (today's production transcript-only path) is
      // completely unchanged — same single console.warn as before, no state
      // change.
      if (!isVoiceNativeRealtimeEnabled()) {
        console.warn("[VoiceChatConnection] realtime error event:", event);
        return;
      }

      // Faz 1A.1 Stabilization root cause: this branch used to treat EVERY
      // "error" event as session-fatal. Per the installed SDK's own
      // RealtimeErrorEvent doc comment — "Most errors are recoverable and
      // the session will stay open, we recommend to implementors to
      // monitor and log error messages by default" — that was wrong. A
      // Historically, native interrupt_response:true made the server and
      // this client's response.cancel race. Native sessions now disable that
      // server-side race, but recoverable provider errors are still not a
      // reason to end the whole session.
      const errorDetail = isRecord(event.error) ? event.error : null;
      const errorCode = typeof errorDetail?.code === "string" ? errorDetail.code : undefined;
      const responseDetail = isRecord(event.response) ? event.response : null;
      const errorResponseId = typeof responseDetail?.id === "string" ? responseDetail.id : null;
      if (errorResponseId && !isOwnedResponseId(errorResponseId, activeResponseIdRef.current)) {
        logVoiceLatency({ label: "native_realtime_stale_event_ignored", at: performance.now() });
        return;
      }

      // [NativeRealtimeError] — structured, single log line. No secrets,
      // tokens, or audio/transcript payload; timing and short identifiers
      // only, same rule as the [VoiceLatency] marks elsewhere in this file.
      console.warn("[NativeRealtimeError]", {
        eventType: event.type,
        errorType: errorDetail?.type,
        errorCode,
        errorMessage: errorDetail?.message,
        errorParam: errorDetail?.param,
        responseId: typeof responseDetail?.id === "string" ? responseDetail.id : undefined,
        responseStatus: typeof responseDetail?.status === "string" ? responseDetail.status : undefined,
        responseStatusDetails: responseDetail?.status_details,
        hasActiveResponse: activeResponseIdRef.current !== null,
        dataChannelReadyState: dataChannelRef.current?.readyState,
        connectionState: peerConnectionRef.current?.connectionState,
        timestamp: new Date().toISOString(),
      });

      if (isFatalRealtimeErrorCode(errorCode)) {
        setConnectionError("Sesli oturumda bir hata oluştu. Bağlantı durduruldu.");
        stop();
      }
      return;
    }
  }, [
    clearSpeechStoppedTimer,
    submitFinalTranscript,
    onSpeechStarted,
    onInterimTranscript,
    onAssistantTranscriptDelta,
    onAssistantTranscriptDone,
    onRealtimeResponseLifecycle,
    stop,
  ]);

  const start = useCallback(async () => {
    cleanup();
    liveTranscriptRef.current = "";
    transcriptTurnRef.current = createTranscriptTurnOwner();
    setTranscript("");
    setConnectionState("idle");
    setIceConnectionState("idle");
    setDataChannelState("connecting");
    setConnectionError(null);

    if (
      typeof window === "undefined" ||
      typeof RTCPeerConnection === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error("Bu tarayıcı sesli bağlantıyı desteklemiyor.");
    }

    try {
      // Faz 1A.1 — Native Voice Runtime. Created unconditionally (not gated
      // on the flag) and before any await, so iOS Safari still considers
      // play() to be within the original user-gesture call stack — after
      // the first await that gesture chain is broken and play() is blocked.
      // Harmless when the flag is off: create_response stays false (see
      // voice/session/route.ts), so no response is ever created and this
      // element never receives a track (ontrack below simply never fires
      // with meaningful audio).
      const remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      remoteAudio.setAttribute("playsinline", "");
      remoteAudio.muted = true;
      remoteAudioRef.current = remoteAudio;
      document.body.appendChild(remoteAudio);
      void remoteAudio.play().catch(() => {});

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      console.info("[VoiceChatConnection][diag] mic permission granted");

      // Diagnostic: if we never reach an open data channel within this
      // window, surface a user-visible error instead of failing silently.
      clearConnectTimeout();
      connectTimeoutRef.current = setTimeout(() => {
        connectTimeoutRef.current = null;
        console.warn(
          "[VoiceChatConnection][diag] connect timeout — no open data channel within",
          CONNECT_TIMEOUT_MS,
          "ms",
        );
        setConnectionError(CONNECT_TIMEOUT_MESSAGE);
      }, CONNECT_TIMEOUT_MS);

      const sessionResponse = await fetch(VOICE_SESSION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const session = (await sessionResponse.json()) as ApiResponse<VoiceRealtimeSessionResponse>;

      if (!session.ok) {
        throw new Error(session.error.message);
      }

      console.info("[VoiceChatConnection][diag] realtime session created:", session.data.session);

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      // Faz 1A.1 — Native Voice Runtime. Adapted from the working pattern in
      // src/lib/onboarding/voice/voice-discovery-controller.ts (ontrack +
      // iOS unlock retry), fitted to this hook's single remoteAudioRef
      // instead of a separate ref set up earlier in an onboarding-specific
      // lifecycle. ontrack fires once per negotiated remote track for the
      // life of this connection — see useVoiceExperienceOrchestrator.ts's
      // native_realtime_first_audio_track comment for why this is a
      // connection-level signal, not a per-turn one.
      peerConnection.ontrack = (trackEvent) => {
        const audio = remoteAudioRef.current;
        if (!audio) return;
        audio.srcObject = trackEvent.streams[0] ?? null;
        audio.muted = false;
        logVoiceLatency({ label: "native_realtime_first_audio_track", at: performance.now() });
        void audio.play().catch((err: unknown) => {
          console.warn("[VoiceChatConnection][diag] remote audio play() blocked:", err);
          setTimeout(() => void audio.play().catch(() => {}), 200);
        });
      };

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.debug("[VoiceChatConnection] connection state:", state);
        console.info("[VoiceChatConnection][diag] connection state:", state);
        setConnectionState(state);
        if (state === "disconnected" || state === "failed") {
          setIsConnected(false);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        console.info("[VoiceChatConnection][diag] ice connection state:", iceState);
        setIceConnectionState(iceState);
      };

      stream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.onopen = () => {
        console.debug("[VoiceChatConnection] data channel open");
        console.info("[VoiceChatConnection][diag] data channel open");
        clearConnectTimeout();
        setDataChannelState("open");
        setConnectionError(null);
        setIsConnected(true);
      };
      dataChannel.onmessage = (messageEvent: MessageEvent) => {
        try {
          handleRealtimeEvent(JSON.parse(String(messageEvent.data)));
        } catch {
          // Malformed realtime event — ignore, connection stays open.
        }
      };
      dataChannel.onerror = () => {
        console.warn("[VoiceChatConnection][diag] data channel error");
        setDataChannelState("error");
      };
      dataChannel.onclose = () => {
        console.debug("[VoiceChatConnection] data channel closed");
        console.info("[VoiceChatConnection][diag] data channel closed");
        setDataChannelState("closed");
        setIsConnected(false);
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdpResponse = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.data.clientSecret.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpResponse.ok) {
        throw new Error(`SDP exchange failed (${sdpResponse.status}).`);
      }

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (error) {
      cleanup();
      throw error;
    }
  }, [cleanup, clearConnectTimeout, handleRealtimeEvent]);

  useEffect(() => cleanup, [cleanup]);

  return {
    isConnected,
    isInputMuted,
    transcript,
    connectionState,
    iceConnectionState,
    dataChannelState,
    connectionError,
    start,
    stop,
    muteInput,
    unmuteInput,
    createResponse,
    cancelActiveResponse,
  };
}

// STT motorlari "METRIX" adini tutarli yazamiyor (metrix/matriks/matrix/matris
// varyantlari). Kullaniciya gorunen transcript ve backend'e gonderilen mesaj
// her zaman kanonik "METRIX" olmali (voice-only; klavye girisine dokunmaz).
// Kelime siniri kullanilir, baska kelime govdelerini etkilemez ("metrik"
// asla eslesmez). "bir matris hesabi" gibi acik matematiksel kullanimlar
// (varyanttan hemen once "bir" varsa) degistirilmez.
const METRIX_NAME_VARIANT_PATTERN = /\b(metrix|matriks|matrix|matris)\b/gi;

function normalizeMetrixNameInTranscript(text: string): string {
  return text.replace(METRIX_NAME_VARIANT_PATTERN, (match, _variant, offset: number, full: string) => {
    const before = full.slice(0, offset).trimEnd();
    const precedingWord = before.slice(before.lastIndexOf(" ") + 1).toLowerCase();
    if (precedingWord === "bir") {
      return match;
    }
    return "METRIX";
  });
}

function isTranscriptDeltaEvent(type: string): boolean {
  return (
    type === "conversation.item.input_audio_transcription.delta" ||
    type === "conversation.item.input_audio_transcription.partial" ||
    type === "input_audio_transcription.delta" ||
    type === "input_audio_transcription.partial"
  );
}

function isTranscriptCompletedEvent(type: string): boolean {
  return (
    type === "conversation.item.input_audio_transcription.completed" ||
    type === "input_audio_transcription.completed"
  );
}

export type TranscriptTurnOwner = {
  finalized: boolean;
};

export function createTranscriptTurnOwner(): TranscriptTurnOwner {
  return { finalized: false };
}

export function claimTranscriptTurn(
  turnOwner: TranscriptTurnOwner,
  rawText: string,
): string | null {
  const finalTranscript = rawText.trim();
  if (!finalTranscript || turnOwner.finalized) {
    return null;
  }

  turnOwner.finalized = true;
  return finalTranscript;
}

// Exported (not just module-private) specifically so it's unit-testable
// without a DOM/WebRTC environment — see
// __tests__/useVoiceChatConnection.native-realtime.test.ts.
export function readTranscriptString(
  event: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = event[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Faz 1A.1 — Native Voice Runtime. Pure helpers factoring the essential
// decisions out of handleRealtimeEvent/cancelActiveResponse so they're
// unit-testable without a DOM/WebRTC environment (this project has no
// jsdom/testing-library dependency — see the test file for why these three
// functions, and not the hook itself, are what's directly tested).

// response.output_audio_transcript.delta accumulation. Order-preserving by
// construction (each call appends to the end of the previous result) — the
// caller is responsible for calling this once per delta in arrival order.
export function accumulateTranscriptDelta(buffer: string, delta: string): string {
  return buffer + delta;
}

// response.output_audio_transcript.done: prefer the event's own final text
// (some server versions include the full transcript on the done event);
// fall back to whatever was accumulated from deltas otherwise. Same
// fallback shape as the existing user-transcript completed-event handling
// above (readTranscriptString(...) || liveTranscriptRef.current).
export function resolveFinalAssistantTranscript(buffer: string, eventProvidedText: string): string {
  return eventProvidedText || buffer;
}

// Barge-in cancel gate: response.cancel must only be sent while a response
// is actually in flight — sending it with none active is the "provider
// behavior for cancelling nothing" case the spec called out to guard
// against explicitly.
export function shouldSendResponseCancel(activeResponseId: string | null): activeResponseId is string {
  return activeResponseId !== null;
}

export function readRealtimeResponseId(event: Record<string, unknown>): string | null {
  if (typeof event.response_id === "string" && event.response_id) return event.response_id;
  const response = isRecord(event.response) ? event.response : null;
  return typeof response?.id === "string" && response.id ? response.id : null;
}

export function isOwnedResponseId(
  eventResponseId: string | null,
  activeResponseId: string | null,
): boolean {
  return activeResponseId !== null && eventResponseId === activeResponseId;
}

export function isOwnedRealtimeResponseEvent(
  event: Record<string, unknown>,
  activeResponseId: string | null,
): boolean {
  return isOwnedResponseId(readRealtimeResponseId(event), activeResponseId);
}

type RealtimeSendChannel = {
  readyState: string;
  send: (data: string) => void;
};

export function sendRealtimeResponseCreate(
  channel: RealtimeSendChannel | null,
  nativeRealtimeEnabled: boolean,
): boolean {
  if (!nativeRealtimeEnabled || channel?.readyState !== "open") return false;
  try {
    channel.send(JSON.stringify({ type: "response.create" }));
    return true;
  } catch {
    return false;
  }
}

// Faz 1A.1 Stabilization. Mirrors the same allowlist already used for this
// exact purpose in src/lib/onboarding/voice/voice-discovery-controller.ts
// (FATAL_REALTIME_ERROR_CODES) — kept as its own small constant here rather
// than importing from that file, since it's a "use client" hook file with
// its own independent lifecycle/state and this phase's scope explicitly
// excludes touching the onboarding voice flow. Per the SDK's own
// RealtimeErrorEvent doc comment ("most errors are recoverable and the
// session will stay open"), only these narrow, session-ending provider
// error codes justify tearing down the whole connection — everything else
// is logged (see the "error" branch above) and the session keeps running.
const FATAL_REALTIME_ERROR_CODES = new Set([
  "session_expired",
  "authentication_error",
  "authorization_error",
]);

export function isFatalRealtimeErrorCode(code: string | undefined): boolean {
  return !!code && FATAL_REALTIME_ERROR_CODES.has(code);
}

// Faz 1A.1 Stabilization. response.done's status field distinguishes
// "completed" and "cancelled" (both fully normal — cancelled is what a
// barge-in produces, see cancelActiveResponse) from "failed" (a
// response-level generation failure). None of these three ever end the
// session — only isFatalRealtimeErrorCode above does that — this only
// decides whether the failure is worth an extra diagnostic log.
export function shouldReportFailedResponseStatus(status: string | undefined): boolean {
  return status === "failed";
}

// Faz 1A.2. Defensive guard against a redundant re-dispatch of the exact
// same response.output_audio_transcript.delta event (matched by the SDK's
// own per-event event_id, e.g. ResponseAudioTranscriptDeltaEvent.event_id).
// An undefined incoming id is never treated as a duplicate of another
// undefined id — that would mean "no event_id available" silently
// suppressing every second delta.
export function isDuplicateRealtimeEvent(
  eventId: string | undefined,
  lastEventId: string | undefined,
): boolean {
  return !!eventId && eventId === lastEventId;
}
