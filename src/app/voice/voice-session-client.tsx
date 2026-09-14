"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef
} from "react";

import {
  reduceVoiceSessionState,
  type VoiceSessionState
} from "./voice-session-client-state";

type LiveBootstrapResponse = {
  bindingId: string;
  answerSdp: string;
  voice: string;
};

const initialState: VoiceSessionState = {
  phase: "idle"
};

function isLiveBootstrapResponse(
  value: unknown
): value is LiveBootstrapResponse {
  if (
    typeof value !== "object"
    || value === null
  ) {
    return false;
  }

  const candidate =
    value as Record<string, unknown>;

  return (
    typeof candidate.bindingId === "string"
    && typeof candidate.answerSdp === "string"
    && typeof candidate.voice === "string"
  );
}

export function VoiceSessionClient() {
  const [
    state,
    dispatch
  ] = useReducer(
    reduceVoiceSessionState,
    initialState
  );

  const peerRef =
    useRef<RTCPeerConnection | null>(
      null
    );

  const streamRef =
    useRef<MediaStream | null>(
      null
    );

  const dataChannelRef =
    useRef<RTCDataChannel | null>(
      null
    );

  const audioRef =
    useRef<HTMLAudioElement | null>(
      null
    );

  const stopTransport =
    useCallback(
      () => {
        const dataChannel =
          dataChannelRef.current;

        dataChannelRef.current =
          null;

        if (dataChannel) {
          try {
            dataChannel.close();
          } catch {
          }
        }

        const peer =
          peerRef.current;

        peerRef.current =
          null;

        if (peer) {
          try {
            peer.close();
          } catch {
          }
        }

        const stream =
          streamRef.current;

        streamRef.current =
          null;

        if (stream) {
          for (
            const track
            of stream.getTracks()
          ) {
            track.stop();
          }
        }

        if (audioRef.current) {
          audioRef.current.srcObject =
            null;
        }
      },
      []
    );

  const stop =
    useCallback(
      () => {
        stopTransport();

        dispatch({
          type: "STOP_REQUESTED"
        });
      },
      [
        stopTransport
      ]
    );

  const start =
    useCallback(
      async () => {
        if (
          state.phase ===
            "requesting_microphone"
          || state.phase ===
            "negotiating"
          || state.phase ===
            "connected"
        ) {
          return;
        }

        stopTransport();

        dispatch({
          type: "START_REQUESTED"
        });

        let stream: MediaStream;

        try {
          stream =
            await navigator.mediaDevices.getUserMedia({
              audio: true
            });
        } catch {
          dispatch({
            type: "MICROPHONE_DENIED"
          });

          return;
        }

        streamRef.current =
          stream;

        dispatch({
          type: "MICROPHONE_READY"
        });

        const peer =
          new RTCPeerConnection();

        peerRef.current =
          peer;

        const dataChannel =
          peer.createDataChannel("oai-events");

        dataChannelRef.current =
          dataChannel;

        dataChannel.addEventListener(
          "message",
          (event) => {
            if (
              typeof event.data
              !== "string"
            ) {
              return;
            }

            try {
              JSON.parse(
                event.data
              );
            } catch {
            }
          }
        );

        peer.addEventListener(
          "track",
          (event) => {
            const [
              remoteStream
            ] = event.streams;

            if (
              remoteStream
              && audioRef.current
            ) {
              audioRef.current.srcObject =
                remoteStream;

              void audioRef.current.play()
                .catch(
                  () => undefined
                );
            }
          }
        );

        for (
          const track
          of stream.getAudioTracks()
        ) {
          peer.addTrack(
            track,
            stream
          );
        }

        try {
          const offer =
            await peer.createOffer();

          await peer.setLocalDescription(
            offer
          );

          const sdp =
            peer.localDescription?.sdp;

          if (!sdp) {
            throw new Error(
              "LOCAL_SDP_MISSING"
            );
          }

          const response =
            await fetch(
              "/api/metrix/live/session",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json"
                },
                body:
                  JSON.stringify({
                    sdp
                  })
              }
            );

          if (!response.ok) {
            throw new Error(
              "LIVE_BOOTSTRAP_FAILED"
            );
          }

          const payload: unknown =
            await response.json();

          if (
            !isLiveBootstrapResponse(
              payload
            )
          ) {
            throw new Error(
              "INVALID_LIVE_BOOTSTRAP_RESPONSE"
            );
          }

          await peer.setRemoteDescription({
            type: "answer",
            sdp: payload.answerSdp
          });

          dispatch({
            type: "CONNECTION_READY"
          });
        } catch {
          stopTransport();

          dispatch({
            type: "CONNECTION_FAILED"
          });
        }
      },
      [
        state.phase,
        stopTransport
      ]
    );

  useEffect(
    () => {
      return () => {
        stopTransport();
      };
    },
    [
      stopTransport
    ]
  );

  const connected =
    state.phase ===
      "connected";

  const busy =
    state.phase ===
      "requesting_microphone"
    || state.phase ===
      "negotiating";

  const status =
    state.phase === "idle"
      ? "Hazır"
      : state.phase ===
          "requesting_microphone"
        ? "Mikrofon açılıyor…"
        : state.phase ===
            "negotiating"
          ? "METRIX bağlanıyor…"
          : state.phase ===
              "connected"
            ? "METRIX dinliyor"
            : state.phase ===
                "recoverable_error"
              ? state.code ===
                  "MICROPHONE_DENIED"
                ? "Mikrofon izni gerekli"
                : "Bağlantı kurulamadı"
              : "Oturum kapatıldı";

  return (
    <main>
      <h1>
        METRIX Voice
      </h1>

      <p aria-live="polite">
        {status}
      </p>

      <div>
        <button
          type="button"
          onClick={
            () => {
              void start();
            }
          }
          disabled={
            busy
            || connected
          }
        >
          Başlat
        </button>

        <button
          type="button"
          onClick={stop}
          disabled={
            !connected
            && !busy
          }
        >
          Durdur
        </button>
      </div>

      <audio
        ref={audioRef}
        autoPlay
      />
    </main>
  );
}
