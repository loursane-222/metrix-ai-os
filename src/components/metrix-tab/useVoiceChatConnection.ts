"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { VoiceRealtimeSessionResponse } from "@/lib/onboarding/voice/realtime-session.types";

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
};

const VOICE_SESSION_URL = "/api/ai/chat/voice/session";
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export function useVoiceChatConnection(
  onFinalTranscript?: (text: string) => void,
  onSpeechStarted?: () => void,
  onInterimTranscript?: (text: string) => void,
): UseVoiceChatConnectionResult {
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
  const lastSentTranscriptRef = useRef("");
  const speechStoppedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [clearSpeechStoppedTimer, clearConnectTimeout]);

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
  // speech_stopped fallback timer). Keeps the empty/duplicate guards and
  // the stop-after-send behavior consistent across all three.
  const submitFinalTranscript = useCallback(
    (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || trimmed === lastSentTranscriptRef.current) {
        return;
      }

      clearSpeechStoppedTimer();
      lastSentTranscriptRef.current = trimmed;
      liveTranscriptRef.current = "";
      onFinalTranscript?.(trimmed);
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
      lastSentTranscriptRef.current = "";
      onSpeechStarted?.();
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      // gpt-realtime-2 does not always emit
      // conversation.item.input_audio_transcription.completed. If neither
      // that event nor conversation.item.created resolves the turn within
      // 1200ms, submit whatever we accumulated from delta events.
      clearSpeechStoppedTimer();
      speechStoppedTimerRef.current = setTimeout(() => {
        speechStoppedTimerRef.current = null;
        submitFinalTranscript(liveTranscriptRef.current);
      }, 1200);
      return;
    }

    if (isTranscriptDeltaEvent(event.type)) {
      const delta = readTranscriptString(event, ["delta", "partial", "transcript"]);
      if (delta) {
        liveTranscriptRef.current = `${liveTranscriptRef.current}${delta}`;
        setTranscript(liveTranscriptRef.current);
        console.debug("[VoiceChatConnection] transcript delta:", delta);
        onInterimTranscript?.(liveTranscriptRef.current);
      }
      return;
    }

    if (isTranscriptCompletedEvent(event.type)) {
      const finalTranscript =
        readTranscriptString(event, ["transcript", "text"]) || liveTranscriptRef.current;
      setTranscript(finalTranscript);
      console.debug("[VoiceChatConnection] transcript final:", finalTranscript);
      submitFinalTranscript(finalTranscript);
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
            setTranscript(part.transcript);
            console.debug("[VoiceChatConnection] transcript via item.created:", part.transcript);
            submitFinalTranscript(part.transcript);
            break;
          }
        }
      }
      return;
    }

    if (event.type === "error") {
      console.warn("[VoiceChatConnection] realtime error event:", event);
    }
  }, [clearSpeechStoppedTimer, submitFinalTranscript, onSpeechStarted, onInterimTranscript]);

  const start = useCallback(async () => {
    cleanup();
    liveTranscriptRef.current = "";
    lastSentTranscriptRef.current = "";
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
  };
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

function readTranscriptString(
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
