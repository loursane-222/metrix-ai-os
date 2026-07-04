"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  VoiceDiscoveryAnalysis,
  VoiceDiscoveryApiResponse,
  VoiceDiscoveryState,
  VoiceDiscoveryTranscriptTurn,
  VoiceDiscoveryTurn,
  VoiceRealtimeSessionResponse,
} from "./realtime-session.types";

type ApiResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

export type VoiceDebugInfo = {
  events: string[];
  connectionState: string;
  iceState: string;
  dataChannelState: string;
  lastTranscript: string;
  lastDiscoveryMode: string;
  lastAssistantMessage: string;
};

type UseVoiceDiscoveryControllerInput = {
  turns: VoiceDiscoveryTurn[];
  onTurnsChange: (turns: VoiceDiscoveryTurn[]) => void;
  onContinueConversation: (message: string) => void;
  onFinalOpinion: (analysis: VoiceDiscoveryAnalysis) => void;
  onError?: (message: string) => void;
};

type UseVoiceDiscoveryControllerResult = {
  state: VoiceDiscoveryState;
  transcript: VoiceDiscoveryTranscriptTurn | null;
  errorMessage: string | null;
  technicalError: string | null;
  isSupported: boolean;
  fallbackMessage: string | null;
  debugInfo: VoiceDebugInfo | null;
  start: () => Promise<void>;
  stop: () => void;
  finishConversation: () => Promise<void>;
};

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const MIN_FINAL_USER_TURNS = 3;
const DEBUG_MAX_EVENTS = 20;
const EARLY_FINAL_FALLBACK_MESSAGE =
  "Bunu sonuca bağlamadan önce bir şeyi daha görmem lazım. Bu sorun en çok kararlar sende toplandığında mı büyüyor, yoksa ekip neye sahip olduğunu bilmediğinde mi?";
const INVALID_FINAL_FALLBACK_MESSAGE =
  "Bunu kapatmadan önce bir şeyi daha sormam lazım. Bu tabloyu en çok büyüten şey görünürlük eksikliği mi, yoksa sorumluluğun net dağılmaması mı?";
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// Error codes from the OpenAI Realtime API that terminate the session.
// Non-listed errors are recoverable: the session may continue.
const FATAL_REALTIME_ERROR_CODES = new Set([
  "session_expired",
  "authentication_error",
  "authorization_error",
]);

export function useVoiceDiscoveryController({
  turns,
  onTurnsChange,
  onContinueConversation,
  onFinalOpinion,
  onError,
}: UseVoiceDiscoveryControllerInput): UseVoiceDiscoveryControllerResult {
  const [state, setState] = useState<VoiceDiscoveryState>("idle");
  const [transcript, setTranscript] =
    useState<VoiceDiscoveryTranscriptTurn | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const turnsRef = useRef<VoiceDiscoveryTurn[]>(turns);
  const pendingSpeechRef = useRef(false);
  const fatalSessionErrorRef = useRef(false);
  const stoppingRef = useRef(false);
  const liveTranscriptRef = useRef("");
  const submittingRef = useRef(false);
  const submissionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstAudioDeltaSeenRef = useRef(false);
  const pendingFinalOpinionRef = useRef<(() => void) | null>(null);
  const consecutiveApiErrorsRef = useRef(0);

  // Debug refs — only populated in development.
  const debugEventsRef = useRef<string[]>([]);
  const [, setDebugTick] = useState(0);
  const debugConnectionStateRef = useRef("new");
  const debugIceStateRef = useRef("new");
  const debugDataChannelStateRef = useRef("closed");
  const debugLastDiscoveryModeRef = useRef("");
  const debugLastAssistantMessageRef = useRef("");

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const isSupported =
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const addDebugEvent = useCallback((label: string) => {
    if (!IS_DEVELOPMENT) {
      return;
    }

    const ts = new Date().toTimeString().slice(0, 8);
    debugEventsRef.current = [`${ts} ${label}`, ...debugEventsRef.current].slice(
      0,
      DEBUG_MAX_EVENTS,
    );
    setDebugTick((t) => t + 1);
  }, []);

  const emitError = useCallback(
    (message: string, technicalReason = "Session error") => {
      fatalSessionErrorRef.current = true;
      setErrorMessage(message);
      setTechnicalError(technicalReason);
      setState("error");
      onError?.(message);
      addDebugEvent(`FATAL: ${technicalReason}`);
    },
    [addDebugEvent, onError],
  );

  const cleanup = useCallback(() => {
    if (submissionTimerRef.current !== null) {
      clearTimeout(submissionTimerRef.current);
      submissionTimerRef.current = null;
    }
    if (responseTimeoutRef.current !== null) {
      clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }
    submittingRef.current = false;
    pendingFinalOpinionRef.current = null;

    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
  }, []);

  const sendRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    const channel = dataChannelRef.current;

    if (!channel || channel.readyState !== "open") {
      return false;
    }

    channel.send(JSON.stringify(event));
    return true;
  }, []);

  const appendLiveTranscript = useCallback((delta: string) => {
    const normalizedDelta = delta.trim();

    if (!normalizedDelta) {
      return;
    }

    liveTranscriptRef.current = mergeTranscriptDelta(
      liveTranscriptRef.current,
      normalizedDelta,
    );
    setTranscript({
      id: "live",
      content: liveTranscriptRef.current,
      isFinal: false,
      createdAt: new Date().toISOString(),
    });
  }, []);

  const speakMetrixMessage = useCallback(
    (message: string) => {
      // TODO: replace with a dedicated TTS endpoint.
      // Realtime audio output is disabled; text is already shown by the caller.
      addDebugEvent(`speak: ${message.slice(0, 50)}`);
      debugLastAssistantMessageRef.current = message;
      setState("listening");
    },
    [addDebugEvent],
  );

  const submitFinalTranscript = useCallback(
    async (content: string) => {
      // Guard against concurrent submissions (e.g. speech_stopped timer firing
      // at the same time as the proper transcription.completed event).
      if (submittingRef.current) {
        addDebugEvent("submit skipped: already submitting");
        return;
      }

      const normalizedContent = content.trim();

      if (!normalizedContent) {
        setState("listening");
        return;
      }

      submittingRef.current = true;

      try {
        setTranscript({
          id: crypto.randomUUID(),
          content: normalizedContent,
          isFinal: true,
          createdAt: new Date().toISOString(),
        });

        setState("thinking");
        addDebugEvent(`submit: "${normalizedContent.slice(0, 40)}"`);

        const nextTurns: VoiceDiscoveryTurn[] = [
          ...turnsRef.current,
          { role: "user", content: normalizedContent },
        ];
        turnsRef.current = nextTurns;
        onTurnsChange(nextTurns);

        let response: ApiResponse<VoiceDiscoveryApiResponse>;
        try {
          response = await postJson<VoiceDiscoveryApiResponse>(
            "/api/onboarding/discovery",
            { turns: nextTurns },
          );
        } catch {
          // Network failure — roll back the optimistic turn and show a soft message.
          addDebugEvent("discovery: network error");
          const rolledBack = turnsRef.current.slice(0, -1);
          turnsRef.current = rolledBack;
          onTurnsChange(rolledBack);
          consecutiveApiErrorsRef.current += 1;
          setFallbackMessage("Bağlantı sorunu. Tekrar konuşabilirsin.");
          setState("listening");
          return;
        }

        if (!response.ok) {
          addDebugEvent(`discovery error: ${response.error.message}`);
          // Roll back the optimistically added user turn so failed retries
          // don't accumulate in turnsRef and inflate the turn count.
          const rolledBack = turnsRef.current.slice(0, -1);
          turnsRef.current = rolledBack;
          onTurnsChange(rolledBack);

          consecutiveApiErrorsRef.current += 1;
          const errorMsg =
            consecutiveApiErrorsRef.current >= 2
              ? "Ses bağlantısında sorun var. Yazarak devam edebilirsin."
              : "Bir sorun oluştu. Tekrar konuşabilirsin.";
          setFallbackMessage(errorMsg);
          setState("listening");
          return;
        }

        consecutiveApiErrorsRef.current = 0;
        debugLastDiscoveryModeRef.current = response.data.mode;
        addDebugEvent(`discovery: ${response.data.mode}`);

        if (response.data.mode === "CONTINUE_CONVERSATION") {
          const message = response.data.message?.trim();
          if (!message) {
            addDebugEvent("discovery: empty message");
            setState("listening");
            return;
          }
          // Set text and debug ref unconditionally before any audio attempt.
          setFallbackMessage(message);
          debugLastAssistantMessageRef.current = message;
          const metrixTurn: VoiceDiscoveryTurn = { role: "metrix", content: message };
          const nextTurnsWithMetrix = [...nextTurns, metrixTurn];
          turnsRef.current = nextTurnsWithMetrix;
          onTurnsChange(nextTurnsWithMetrix);
          onContinueConversation(message);
          speakMetrixMessage(message);
          return;
        }

        const finalAnalysis = normalizeFinalOpinion(response.data);

        if (!finalAnalysis) {
          setFallbackMessage(INVALID_FINAL_FALLBACK_MESSAGE);
          turnsRef.current = continueWithMetrixFallback(
            nextTurns,
            INVALID_FINAL_FALLBACK_MESSAGE,
            onTurnsChange,
            onContinueConversation,
            speakMetrixMessage,
          );
          return;
        }

        if (countUserTurns(nextTurns) < MIN_FINAL_USER_TURNS) {
          setFallbackMessage(EARLY_FINAL_FALLBACK_MESSAGE);
          turnsRef.current = continueWithMetrixFallback(
            nextTurns,
            EARLY_FINAL_FALLBACK_MESSAGE,
            onTurnsChange,
            onContinueConversation,
            speakMetrixMessage,
          );
          return;
        }

        const summary = buildFinalSummary(finalAnalysis);
        setFallbackMessage(summary);
        speakMetrixMessage(summary);
        onFinalOpinion(finalAnalysis);
      } finally {
        submittingRef.current = false;
        // Clear live transcript so finishConversation cannot re-submit it.
        liveTranscriptRef.current = "";
      }
    },
    [
      addDebugEvent,
      onContinueConversation,
      onFinalOpinion,
      onTurnsChange,
      speakMetrixMessage,
    ],
  );

  const finishConversation = useCallback(async () => {
    // If there is a live transcript in progress, submit it as the final user turn.
    const liveContent = liveTranscriptRef.current.trim();
    if (liveContent) {
      await submitFinalTranscript(liveContent);
      return;
    }

    // No pending transcript — force a final opinion from the existing turns.
    const currentTurns = turnsRef.current;
    if (currentTurns.filter((t) => t.role === "user").length === 0) {
      return;
    }

    setState("thinking");
    addDebugEvent("finish: forcing final opinion");

    try {
      const response = await postJson<VoiceDiscoveryApiResponse>(
        "/api/onboarding/discovery",
        { turns: currentTurns, forceFinal: true },
      );

      if (!response.ok) {
        addDebugEvent(`finish error: ${response.error.message}`);
        setState("listening");
        return;
      }

      addDebugEvent(`finish discovery: ${response.data.mode}`);

      if (response.data.mode === "CONTINUE_CONVERSATION") {
        const msg = response.data.message.trim();
        const metrixTurn: VoiceDiscoveryTurn = { role: "metrix", content: msg };
        const nextTurns = [...currentTurns, metrixTurn];
        turnsRef.current = nextTurns;
        onTurnsChange(nextTurns);
        onContinueConversation(msg);
        setFallbackMessage(msg);
        speakMetrixMessage(msg);
        return;
      }

      const finalAnalysis = normalizeFinalOpinion(response.data);
      if (finalAnalysis) {
        onFinalOpinion(finalAnalysis);
      } else {
        setState("listening");
      }
    } catch {
      addDebugEvent("finish: request failed");
      setState("listening");
    }
  }, [
    addDebugEvent,
    onContinueConversation,
    onFinalOpinion,
    onTurnsChange,
    speakMetrixMessage,
    submitFinalTranscript,
  ]);

  const handleRealtimeEvent = useCallback(
    (event: unknown) => {
      if (!isRecord(event) || typeof event.type !== "string") {
        return;
      }

      debugRealtimeEvent(event);

      // Skip high-frequency delta events from the debug log to avoid noise.
      if (
        !event.type.endsWith(".delta") &&
        !event.type.endsWith(".partial") &&
        event.type !== "input_audio_buffer.append"
      ) {
        addDebugEvent(`rt: ${event.type}`);
      }

      if (event.type === "input_audio_buffer.speech_started") {
        pendingSpeechRef.current = true;
        liveTranscriptRef.current = "";
        sendRealtimeEvent({ type: "response.cancel" });
        setState("user_speaking");
        return;
      }

      // VAD detected silence. Start a fallback timer: if
      // conversation.item.input_audio_transcription.completed never arrives
      // (common on some iPhone/model combinations), submit the live transcript
      // we have accumulated from delta events.
      if (event.type === "input_audio_buffer.speech_stopped") {
        if (submissionTimerRef.current !== null) {
          clearTimeout(submissionTimerRef.current);
        }
        submissionTimerRef.current = setTimeout(() => {
          submissionTimerRef.current = null;
          if (!pendingSpeechRef.current || submittingRef.current) {
            return;
          }
          const content = liveTranscriptRef.current.trim();
          addDebugEvent(`fallback submit: "${content.slice(0, 40)}"`);
          pendingSpeechRef.current = false;
          void submitFinalTranscript(content);
        }, 1200);
        return;
      }

      // User speech transcription (input) — delta events.
      if (isUserTranscriptDeltaEvent(event.type)) {
        appendLiveTranscript(readTranscriptDelta(event));
        return;
      }

      // User speech transcription (input) — completion (canonical path).
      // Also cancels the speech_stopped fallback timer.
      if (isUserTranscriptCompletedEvent(event.type)) {
        if (submissionTimerRef.current !== null) {
          clearTimeout(submissionTimerRef.current);
          submissionTimerRef.current = null;
        }
        pendingSpeechRef.current = false;
        const completedTranscript =
          readTranscriptFinal(event) || liveTranscriptRef.current;
        liveTranscriptRef.current = completedTranscript;
        addDebugEvent(`transcript: "${completedTranscript.slice(0, 40)}"`);
        void submitFinalTranscript(completedTranscript);
        return;
      }

      // conversation.item.created can carry the user transcript in newer API
      // versions (gpt-realtime-2) where a separate transcription.completed
      // event may not be emitted.
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
              part.transcript.trim() &&
              pendingSpeechRef.current &&
              !submittingRef.current
            ) {
              if (submissionTimerRef.current !== null) {
                clearTimeout(submissionTimerRef.current);
                submissionTimerRef.current = null;
              }
              pendingSpeechRef.current = false;
              const t = part.transcript.trim();
              addDebugEvent(`item.created transcript: "${t.slice(0, 40)}"`);
              void submitFinalTranscript(t);
              return;
            }
          }
        }
        return;
      }

      // Assistant audio transcript events (output) — these are Metrix's own
      // words being transcribed, NOT user input. They must not trigger
      // submitFinalTranscript or appendLiveTranscript.
      if (
        event.type === "response.audio_transcript.delta" ||
        event.type === "response.audio_transcript.done"
      ) {
        return;
      }

      if (event.type === "response.audio.delta") {
        if (!firstAudioDeltaSeenRef.current) {
          firstAudioDeltaSeenRef.current = true;
          addDebugEvent("rt: first audio.delta ✓");
        }
        return;
      }

      if (
        event.type === "response.audio.done" ||
        event.type === "response.done"
      ) {
        if (responseTimeoutRef.current !== null) {
          clearTimeout(responseTimeoutRef.current);
          responseTimeoutRef.current = null;
        }
        if (!pendingSpeechRef.current && !fatalSessionErrorRef.current) {
          setState("listening");
        }
        return;
      }

      if (event.type === "error") {
        const errorCode = readNestedString(event, ["error", "code"]);
        const errorMsg = readRealtimeErrorMessage(event);
        addDebugEvent(`rt error: ${errorCode || errorMsg || "unknown"}`);

        // Only codes that permanently terminate the session should be fatal.
        // All other error events are warnings; the session can continue.
        if (FATAL_REALTIME_ERROR_CODES.has(errorCode)) {
          emitError(
            "Ses oturumu sona erdi. Yazarak devam edebilirsin.",
            errorMsg ?? errorCode,
          );
        }
      }
    },
    [
      addDebugEvent,
      appendLiveTranscript,
      emitError,
      sendRealtimeEvent,
      submitFinalTranscript,
    ],
  );

  const start = useCallback(async () => {
    if (!isSupported) {
      emitError("Bu tarayıcı sesli görüşmeyi desteklemiyor.");
      return;
    }

    cleanup();
    stoppingRef.current = false;
    fatalSessionErrorRef.current = false;
    liveTranscriptRef.current = "";
    submittingRef.current = false;
    firstAudioDeltaSeenRef.current = false;
    pendingFinalOpinionRef.current = null;
    debugEventsRef.current = [];
    debugConnectionStateRef.current = "new";
    debugIceStateRef.current = "new";
    debugDataChannelStateRef.current = "closed";
    debugLastDiscoveryModeRef.current = "";
    debugLastAssistantMessageRef.current = "";
    setState("requesting_microphone");
    setErrorMessage(null);
    setTechnicalError(null);
    setFallbackMessage(null);

    // Create and unlock audio element here — before any await — so that iOS
    // Safari still considers this within the original user-gesture context.
    // After the first await the gesture chain is broken and play() is blocked.
    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    remoteAudio.setAttribute("playsinline", "");
    remoteAudio.muted = true;
    remoteAudioRef.current = remoteAudio;
    document.body.appendChild(remoteAudio);
    void remoteAudio.play().catch(() => {});

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const session = await postJson<VoiceRealtimeSessionResponse>(
        "/api/onboarding/voice/session",
        {},
      );

      if (!session.ok) {
        emitError(session.error.message, "Session kurulamadı");
        cleanup();
        return;
      }

      addDebugEvent(`session ok: ${session.data.session.model}`);

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      peerConnection.ontrack = (trackEvent) => {
        const audio = remoteAudioRef.current;
        if (!audio) return;
        audio.srcObject = trackEvent.streams[0] ?? null;
        audio.muted = false;
        addDebugEvent("track received");
        void audio.play().catch((err: unknown) => {
          addDebugEvent(`play() blocked: ${String(err).slice(0, 60)}`);
          // One retry after a brief tick — helps with iOS timing edge cases.
          setTimeout(() => void audio.play().catch(() => {}), 200);
        });
      };

      peerConnection.onconnectionstatechange = () => {
        debugConnectionStateRef.current = peerConnection.connectionState;
        addDebugEvent(`conn: ${peerConnection.connectionState}`);

        if (
          !fatalSessionErrorRef.current &&
          !stoppingRef.current &&
          (peerConnection.connectionState === "disconnected" ||
            peerConnection.connectionState === "failed")
        ) {
          setState("reconnecting");
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        debugIceStateRef.current = peerConnection.iceConnectionState;
        addDebugEvent(`ice: ${peerConnection.iceConnectionState}`);
      };

      stream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.onopen = () => {
        debugDataChannelStateRef.current = "open";
        addDebugEvent("dc: open");

        if (!fatalSessionErrorRef.current) {
          setState("listening");
        }
      };
      dataChannel.onmessage = (messageEvent: MessageEvent) => {
        try {
          handleRealtimeEvent(JSON.parse(String(messageEvent.data)));
        } catch {
          // Ignore malformed realtime events.
        }
      };
      dataChannel.onerror = () => {
        debugDataChannelStateRef.current = "error";
        addDebugEvent("dc: error");
        emitError(
          "Ses bağlantısı kurulamadı. Yazarak devam edebilirsin.",
          "Data channel error",
        );
      };
      dataChannel.onclose = () => {
        debugDataChannelStateRef.current = "closed";
        addDebugEvent("dc: closed");

        if (
          peerConnectionRef.current &&
          !fatalSessionErrorRef.current &&
          !stoppingRef.current
        ) {
          setState("reconnecting");
        }
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
        emitError(
          "Ses bağlantısı kurulamadı. Yazarak devam edebilirsin.",
          `SDP ${sdpResponse.status}`,
        );
        cleanup();
        return;
      }

      addDebugEvent("SDP answer received");

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (err: unknown) {
      cleanup();
      addDebugEvent(`startup error: ${String(err).slice(0, 60)}`);
      emitError(
        "Ses başlatılamadı. Yazarak devam edebilirsin.",
        "Microphone or WebRTC startup failed",
      );
    }
  }, [addDebugEvent, cleanup, emitError, handleRealtimeEvent, isSupported]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    cleanup();
    setState("idle");
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  const debugInfo: VoiceDebugInfo | null = IS_DEVELOPMENT
    ? {
        events: debugEventsRef.current,
        connectionState: debugConnectionStateRef.current,
        iceState: debugIceStateRef.current,
        dataChannelState: debugDataChannelStateRef.current,
        lastTranscript: liveTranscriptRef.current,
        lastDiscoveryMode: debugLastDiscoveryModeRef.current,
        lastAssistantMessage: debugLastAssistantMessageRef.current,
      }
    : null;

  return {
    state,
    transcript,
    errorMessage,
    technicalError,
    isSupported,
    fallbackMessage,
    debugInfo,
    start,
    stop,
    finishConversation,
  };
}

async function postJson<T>(url: string, body: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as ApiResponse<T>;
}

function readString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  return typeof field === "string" ? field : "";
}

// User speech transcription deltas (input audio → text, streaming).
// Does NOT include response.audio_transcript.delta which is Metrix's own speech.
function isUserTranscriptDeltaEvent(type: string): boolean {
  return (
    type === "conversation.item.input_audio_transcription.delta" ||
    type === "conversation.item.input_audio_transcription.partial" ||
    type === "input_audio_transcription.delta" ||
    type === "input_audio_transcription.partial"
  );
}

// User speech transcription completion (final user turn ready for submission).
// Does NOT include response.audio_transcript.done which is Metrix's own speech.
function isUserTranscriptCompletedEvent(type: string): boolean {
  return (
    type === "conversation.item.input_audio_transcription.completed" ||
    type === "input_audio_transcription.completed"
  );
}

function readTranscriptDelta(event: Record<string, unknown>): string {
  return (
    readString(event, "delta") ||
    readString(event, "partial") ||
    readString(event, "transcript") ||
    readNestedString(event, ["item", "content", "transcript"])
  );
}

function readTranscriptFinal(event: Record<string, unknown>): string {
  return (
    readString(event, "transcript") ||
    readString(event, "text") ||
    readNestedString(event, ["item", "content", "transcript"])
  ).trim();
}

function mergeTranscriptDelta(current: string, delta: string): string {
  if (!current) {
    return delta;
  }

  if (delta.startsWith(current)) {
    return delta;
  }

  return `${current}${delta.startsWith(" ") ? "" : " "}${delta}`.trim();
}

function readRealtimeErrorMessage(event: Record<string, unknown>): string | null {
  const directMessage = readString(event, "message");
  const nestedMessage = readNestedString(event, ["error", "message"]);
  const nestedType = readNestedString(event, ["error", "type"]);
  const message = directMessage || nestedMessage;

  if (message && nestedType) {
    return `${nestedType}: ${message}`;
  }

  return message || nestedType || null;
}

function readNestedString(
  value: Record<string, unknown>,
  path: string[],
): string {
  let current: unknown = value;

  for (const key of path) {
    if (!isRecord(current)) {
      return "";
    }

    current = current[key];
  }

  return typeof current === "string" ? current : "";
}

function debugRealtimeEvent(event: Record<string, unknown>): void {
  if (!IS_DEVELOPMENT) {
    return;
  }

  console.debug("[VoiceDiscovery] realtime event", event.type, {
    error: isRecord(event.error) ? event.error : undefined,
    hasDelta: typeof event.delta === "string",
    hasTranscript: typeof event.transcript === "string",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeFinalOpinion(
  response: VoiceDiscoveryApiResponse,
): VoiceDiscoveryAnalysis | null {
  if (response.mode !== "FINAL_OPINION") {
    return null;
  }

  const rawFocusItems: unknown = response.focusItems;
  const focusItems = (Array.isArray(rawFocusItems) ? rawFocusItems : [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  const firstImpression = readTrimmedString(response, "firstImpression");
  const reason = readTrimmedString(response, "reason");
  const caveat = readTrimmedString(response, "caveat");
  const expectedOutcome = readTrimmedString(response, "expectedOutcome");

  if (
    !firstImpression ||
    !reason ||
    !caveat ||
    !expectedOutcome ||
    focusItems.length !== 3
  ) {
    return null;
  }

  return {
    firstImpression,
    reason,
    caveat,
    focusItems,
    expectedOutcome,
  };
}

function countUserTurns(turns: VoiceDiscoveryTurn[]): number {
  return turns.filter((turn) => turn.role === "user").length;
}

function continueWithMetrixFallback(
  currentTurns: VoiceDiscoveryTurn[],
  message: string,
  onTurnsChange: (turns: VoiceDiscoveryTurn[]) => void,
  onContinueConversation: (message: string) => void,
  speakMetrixMessage: (message: string) => void,
): VoiceDiscoveryTurn[] {
  const metrixTurn: VoiceDiscoveryTurn = {
    role: "metrix",
    content: message,
  };
  const nextTurnsWithMetrix = [...currentTurns, metrixTurn];
  onTurnsChange(nextTurnsWithMetrix);
  onContinueConversation(message);
  speakMetrixMessage(message);
  return nextTurnsWithMetrix;
}

function readTrimmedString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

function buildFinalSummary(analysis: VoiceDiscoveryAnalysis): string {
  return `${analysis.firstImpression} ${analysis.expectedOutcome}`;
}
