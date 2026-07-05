"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { VoiceRealtimeSessionResponse } from "@/lib/onboarding/voice/realtime-session.types";

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string } };

type UseVoiceChatConnectionResult = {
  isConnected: boolean;
  transcript: string;
  start: () => Promise<void>;
  stop: () => void;
};

const VOICE_SESSION_URL = "/api/ai/chat/voice/session";
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export function useVoiceChatConnection(
  onFinalTranscript?: (text: string) => void,
): UseVoiceChatConnectionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState("");

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveTranscriptRef = useRef("");
  const lastSentTranscriptRef = useRef("");
  const speechStoppedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSpeechStoppedTimer = useCallback(() => {
    if (speechStoppedTimerRef.current !== null) {
      clearTimeout(speechStoppedTimerRef.current);
      speechStoppedTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearSpeechStoppedTimer();

    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, [clearSpeechStoppedTimer]);

  const stop = useCallback(() => {
    cleanup();
    setIsConnected(false);
    setTranscript("");
  }, [cleanup]);

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
      stop();
    },
    [clearSpeechStoppedTimer, onFinalTranscript, stop],
  );

  const handleRealtimeEvent = useCallback((event: unknown) => {
    if (!isRecord(event) || typeof event.type !== "string") {
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      clearSpeechStoppedTimer();
      liveTranscriptRef.current = "";
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
  }, [clearSpeechStoppedTimer, submitFinalTranscript]);

  const start = useCallback(async () => {
    cleanup();
    liveTranscriptRef.current = "";
    lastSentTranscriptRef.current = "";
    setTranscript("");

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

      const sessionResponse = await fetch(VOICE_SESSION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const session = (await sessionResponse.json()) as ApiResponse<VoiceRealtimeSessionResponse>;

      if (!session.ok) {
        throw new Error(session.error.message);
      }

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      peerConnection.onconnectionstatechange = () => {
        console.debug("[VoiceChatConnection] connection state:", peerConnection.connectionState);
        if (
          peerConnection.connectionState === "disconnected" ||
          peerConnection.connectionState === "failed"
        ) {
          setIsConnected(false);
        }
      };

      stream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.onopen = () => {
        console.debug("[VoiceChatConnection] data channel open");
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
        console.warn("[VoiceChatConnection] data channel error");
      };
      dataChannel.onclose = () => {
        console.debug("[VoiceChatConnection] data channel closed");
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
  }, [cleanup, handleRealtimeEvent]);

  useEffect(() => cleanup, [cleanup]);

  return { isConnected, transcript, start, stop };
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
