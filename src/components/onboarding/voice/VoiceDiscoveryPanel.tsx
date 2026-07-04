"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  VoiceDiscoveryAnalysis,
  VoiceDiscoveryState,
  VoiceDiscoveryTurn,
} from "@/lib/onboarding/voice/realtime-session.types";
import { useVoiceDiscoveryController } from "@/lib/onboarding/voice/voice-discovery-controller";

import { VoiceOrb } from "./VoiceOrb";
import { VoiceTranscript } from "./VoiceTranscript";

const SHOW_VOICE_DEBUG =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_VOICE_DEBUG === "true";

// Push-to-talk turn state — authoritative UX state in the Panel.
// controller.state drives only the orb animation during "listening".
type VoiceTurnState =
  | "idle"            // initial: show start button
  | "listening"       // mic open, realtime active
  | "thinking"        // transcript submitted, discovery in flight, WebRTC closed
  | "speaking"        // TTS playing, mic locked
  | "ready_for_next"  // TTS done: show speak + finalize buttons
  | "finalizing";     // waiting for final opinion API

type VoiceDiscoveryPanelProps = {
  turns: VoiceDiscoveryTurn[];
  onContinueConversation: (message: string) => void;
  onError: (message: string) => void;
  onFinalOpinion: (analysis: VoiceDiscoveryAnalysis) => void;
  onTextFallback: () => void;
  onTurnsChange: (turns: VoiceDiscoveryTurn[]) => void;
};

export function VoiceDiscoveryPanel({
  turns,
  onContinueConversation,
  onError,
  onFinalOpinion,
  onTextFallback,
  onTurnsChange,
}: VoiceDiscoveryPanelProps) {
  const controller = useVoiceDiscoveryController({
    turns,
    onTurnsChange,
    onContinueConversation,
    onFinalOpinion,
    onError,
  });

  const [turnState, setTurnState] = useState<VoiceTurnState>("idle");
  // Ref mirrors state so async closures (TTS effect) read current value
  // without needing turnState in dep arrays (which would cancel in-flight fetches).
  const turnStateRef = useRef<VoiceTurnState>("idle");

  const audioRef = useRef<HTMLAudioElement>(null);
  const ttsUrlRef = useRef<string | null>(null);
  const lastSpokenRef = useRef<string | null>(null);

  const setTurn = useCallback((next: VoiceTurnState) => {
    turnStateRef.current = next;
    setTurnState(next);
  }, []);

  // When controller reports transcript-submitted ("thinking"), close the WebRTC
  // session immediately so no further STT input arrives while Metrix is
  // generating or speaking. The in-flight discovery fetch continues unaffected.
  // Also reset to idle on fatal session errors.
  useEffect(() => {
    if (controller.state === "thinking" && turnStateRef.current === "listening") {
      setTurn("thinking");
      controller.stop();
      return;
    }
    if (controller.state === "error") {
      const audio = audioRef.current;
      if (audio && !audio.paused) audio.pause();
      setTurn("idle");
    }
  }, [controller.state, setTurn, controller.stop]);

  // TTS: fires once per new fallbackMessage while turnState is "thinking".
  // Drives: thinking → speaking → ready_for_next.
  // turnState is intentionally NOT in dep array: adding it would cancel the
  // in-flight fetch when setTurn("speaking") triggers a re-render.
  useEffect(() => {
    const message = controller.fallbackMessage;
    if (!message) {
      // controller.start() resets fallbackMessage to null — clear the dedup
      // guard so the same error message can replay in the next session.
      lastSpokenRef.current = null;
      return;
    }
    if (message === lastSpokenRef.current) return;
    if (turnStateRef.current !== "thinking") return;

    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (ttsUrlRef.current) {
      URL.revokeObjectURL(ttsUrlRef.current);
      ttsUrlRef.current = null;
      audio.src = "";
    }

    lastSpokenRef.current = message;
    setTurn("speaking");

    let cancelled = false;

    const finish = () => {
      if (!cancelled) setTurn("ready_for_next");
    };

    fetch("/api/onboarding/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) {
          finish();
          return;
        }
        const url = URL.createObjectURL(blob);
        ttsUrlRef.current = url;
        audio.muted = false;
        audio.src = url;
        audio.onended = finish;
        audio.onerror = finish;
        audio.load();
        void audio.play().catch(finish);
      })
      .catch(finish);

    return () => {
      cancelled = true;
    };
  }, [controller.fallbackMessage, setTurn]);

  // Safety valve: if "thinking" state lasts more than 12 seconds without TTS
  // completing (e.g. blocked dedup guard or TTS network failure), unblock the
  // panel so the user always has a button to continue with.
  useEffect(() => {
    if (turnState !== "thinking") return;
    const timer = setTimeout(() => {
      if (turnStateRef.current === "thinking") setTurn("ready_for_next");
    }, 12000);
    return () => clearTimeout(timer);
  }, [turnState, setTurn]);

  // Revoke object URL on unmount.
  useEffect(() => {
    return () => {
      if (ttsUrlRef.current) URL.revokeObjectURL(ttsUrlRef.current);
    };
  }, []);

  const hasError = Boolean(controller.errorMessage);
  const orbState = toOrbState(turnState, controller.state);
  const statusLabel = hasError
    ? "Ses bağlantısı kurulamadı"
    : getTurnStatusLabel(turnState, controller.state);

  const canSpeak = turnState === "idle" || turnState === "ready_for_next";
  const canFinalize = turnState === "ready_for_next";

  return (
    <>
      <section className="mb-4 shrink-0 rounded-[24px] border border-[#ead7bf] bg-white/72 px-4 py-5 shadow-[0_16px_34px_rgba(7,18,38,0.07)]">
        <div className="flex flex-col items-center text-center">
          <VoiceOrb state={orbState} />
          {statusLabel ? (
            turnState === "speaking" ? (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a5a2b]" />
                <span className="text-[13px] font-semibold text-[#8a5a2b]">
                  Metrix konuşuyor
                </span>
              </div>
            ) : (
              <p className="mt-3 text-[18px] font-black leading-6 text-[#071226]">
                {statusLabel}
              </p>
            )
          ) : null}
          <div className="mt-3 w-full">
            <VoiceTranscript transcript={controller.transcript} />
          </div>

          {controller.fallbackMessage ? (
            <div className="mt-3 w-full rounded-[14px] border border-[#d4c5ad] bg-[#fdf8f2] px-3 py-2 text-left">
              <p className="text-[14px] leading-5 text-[#3d2c14]">
                {controller.fallbackMessage}
              </p>
            </div>
          ) : null}

          {controller.errorMessage ? (
            <div className="mt-3 rounded-[14px] border border-[#e4b4a4] bg-[#fff5f1] px-3 py-2 text-center">
              <p className="text-[13px] font-bold leading-5 text-[#8c3324]">
                {controller.errorMessage}
              </p>
            </div>
          ) : null}

          {canSpeak ? (
            <button
              className="mt-4 flex h-[50px] w-full items-center justify-center rounded-[16px] bg-[#071226] px-4 text-[15px] font-black text-white shadow-[0_18px_34px_rgba(7,18,38,0.26)] disabled:cursor-not-allowed disabled:bg-[#8f877c] disabled:shadow-none"
              disabled={!controller.isSupported}
              onClick={() => {
                const audio = audioRef.current;
                if (audio) {
                  if (!audio.paused) {
                    audio.pause();
                    audio.currentTime = 0;
                  }
                  // Unlock audio element within the user gesture for iOS Safari.
                  audio.muted = true;
                  void audio.play().catch(() => {});
                }
                setTurn("listening");
                void controller.start();
              }}
              type="button"
            >
              {turnState === "idle" ? "Sesli görüşmeyi başlat" : "Tekrar konuş"}
            </button>
          ) : null}

          {canFinalize ? (
            <button
              className="mt-2 flex h-[44px] w-full items-center justify-center rounded-[16px] border border-[#d4c5ad] bg-transparent px-4 text-[14px] font-bold text-[#3d2c14]"
              onClick={() => {
                setTurn("finalizing");
                void controller.finishConversation();
              }}
              type="button"
            >
              İlk değerlendirmeyi gör
            </button>
          ) : null}

          <button
            className="mt-3 h-10 px-3 text-[14px] font-black text-[#8a5a2b]"
            onClick={() => {
              controller.stop();
              onTextFallback();
            }}
            type="button"
          >
            Yazarak devam et
          </button>
        </div>
      </section>

      <audio ref={audioRef} playsInline preload="auto" style={{ display: "none" }} />

      {SHOW_VOICE_DEBUG && controller.debugInfo ? (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(7,18,38,0.92)",
            color: "#a0ffa0",
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.4,
            padding: "6px 8px",
            zIndex: 9999,
            maxHeight: 140,
            overflow: "hidden",
            pointerEvents: "none",
            borderTop: "1px solid #1a3060",
          }}
        >
          <div style={{ color: "#ffdd88", marginBottom: 4, fontSize: 10 }}>
            ▶ VOICE DEBUG (dev only)
          </div>
          <div style={{ color: "#88ccff", marginBottom: 2 }}>
            {`conn:${controller.debugInfo.connectionState} ice:${controller.debugInfo.iceState} dc:${controller.debugInfo.dataChannelState} turn:${turnState}`}
          </div>
          {controller.debugInfo.lastTranscript ? (
            <div style={{ color: "#ffaaff", marginBottom: 2 }}>
              {`transcript: "${controller.debugInfo.lastTranscript.slice(0, 60)}"`}
            </div>
          ) : null}
          {controller.debugInfo.lastDiscoveryMode ? (
            <div style={{ color: "#aaffee", marginBottom: 2 }}>
              {`discovery: ${controller.debugInfo.lastDiscoveryMode}`}
            </div>
          ) : null}
          {controller.debugInfo.lastAssistantMessage ? (
            <div style={{ color: "#ffeeaa", marginBottom: 4 }}>
              {`assistant: "${controller.debugInfo.lastAssistantMessage.slice(0, 60)}"`}
            </div>
          ) : null}
          {controller.debugInfo.events.map((entry, i) => (
            <div key={i} style={{ color: "#a0ffa0", opacity: 1 - i * 0.04 }}>
              {entry}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function getTurnStatusLabel(
  turn: VoiceTurnState,
  controllerState: VoiceDiscoveryState,
): string {
  if (turn === "listening") {
    return controllerState === "user_speaking" ? "Sizi duyuyorum" : "Sizi dinliyorum";
  }
  if (turn === "thinking") return "Düşünüyorum";
  if (turn === "speaking") return "Metrix konuşuyor";
  if (turn === "finalizing") return "Değerlendirme hazırlanıyor";
  return "";
}

function toOrbState(
  turn: VoiceTurnState,
  controllerState: VoiceDiscoveryState,
): VoiceDiscoveryState {
  if (turn === "idle") return "idle";
  if (turn === "listening") return controllerState;
  if (turn === "thinking") return "thinking";
  if (turn === "speaking") return "metrix_speaking";
  if (turn === "ready_for_next") return "idle";
  if (turn === "finalizing") return "thinking";
  return "idle";
}
