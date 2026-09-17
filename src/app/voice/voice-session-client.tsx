"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type RefObject
} from "react";

import {
  reduceVoiceSessionState,
  type VoiceSessionState
} from "./voice-session-client-state";

import type { TurnResult } from "../../lib/agent/turn-result";
import type { Presentation } from "../../lib/presentation/contracts";

import { MetrixViewSurface } from "../../components/metrix-view/MetrixViewSurface";

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

export type TurnResultDeliveryState = {
  version: number;
  turnResult: TurnResult<Presentation> | null;
};

type TurnResultDeliveryResponse = {
  ok: true;
  version: number;
  turnResult: TurnResult<Presentation> | null;
};

function isTurnResultDeliveryResponse(
  value: unknown
): value is TurnResultDeliveryResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.ok === true
    && typeof candidate.version === "number"
  );
}

export type UseVoiceSessionResult = {
  state: VoiceSessionState;
  start: () => Promise<void>;
  stop: () => void;
  audioRef: RefObject<HTMLAudioElement | null>;
  resultDelivery: TurnResultDeliveryState;
};

/**
 * The one browser-side implementation of the METRIX Live voice trust
 * boundary (getUserMedia -> RTCPeerConnection -> POST /api/metrix/live/session
 * -> remote audio track), extracted as a hook so both the standalone /voice
 * page and the main composer's mic button drive the exact same connection
 * logic rather than each having their own copy of it. Nothing about the
 * WebRTC handshake, the endpoint, or the data channel changes here — see
 * tests/architecture/voice-browser-boundary.test.ts, which asserts this
 * file (not any other) contains that boundary logic.
 */
export function useVoiceSession(): UseVoiceSessionResult {
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

  const bindingIdRef =
    useRef<string | null>(
      null
    );

  const resultVersionRef =
    useRef(0);

  const eventSourceRef =
    useRef<EventSource | null>(
      null
    );

  const [
    resultDelivery,
    setResultDelivery
  ] = useState<TurnResultDeliveryState>({
    version: 0,
    turnResult: null
  });

  // Applies an incoming TurnResult delivery payload — from the stream's
  // first ("current state") event or any later push — only when it is
  // strictly newer than the last one applied. Purely a monotonic guard:
  // reads nothing about which business tool ran or why, so a duplicate/
  // replayed/out-of-order message can never regress past the latest one
  // already shown.
  const applyResultDelivery =
    useCallback(
      (payload: TurnResultDeliveryResponse) => {
        if (
          payload.version >
          resultVersionRef.current
        ) {
          resultVersionRef.current =
            payload.version;

          setResultDelivery({
            version: payload.version,
            turnResult: payload.turnResult
          });
        }
      },
      []
    );

  // Opens the one push connection for "is a newer canonical TurnResult
  // available for this binding". Native EventSource: the browser owns
  // reconnection on a dropped connection, so this needs no manual retry/
  // backoff of its own. Delivery is therefore driven purely by the server
  // publishing a result — never by whether the model said anything on its
  // own data channel, and never by a fixed poll cadence.
  const attachResultDeliveryStream =
    useCallback(
      (bindingId: string) => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        const source = new EventSource(
          `/api/metrix/live/session/${encodeURIComponent(bindingId)}/result`
        );

        eventSourceRef.current = source;

        source.onmessage = (event) => {
          let payload: unknown;

          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }

          if (isTurnResultDeliveryResponse(payload)) {
            applyResultDelivery(payload);
          }
        };
      },
      [applyResultDelivery]
    );

  const detachResultDeliveryStream =
    useCallback(
      () => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        bindingIdRef.current = null;
      },
      []
    );

  const stopTransport =
    useCallback(
      () => {
        detachResultDeliveryStream();

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
      [
        detachResultDeliveryStream
      ]
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

          bindingIdRef.current =
            payload.bindingId;

          resultVersionRef.current = 0;

          setResultDelivery({
            version: 0,
            turnResult: null
          });

          attachResultDeliveryStream(
            payload.bindingId
          );

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
        attachResultDeliveryStream,
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

  return {
    state,
    start,
    stop,
    audioRef,
    resultDelivery
  };
}

/** Turkish status copy for a voice session phase, shared by every surface that shows one. */
export function voiceStatusLabel(
  state: VoiceSessionState
): string {
  return state.phase === "idle"
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
}

export function VoiceSessionClient() {
  return <VoiceSessionClientBody />;
}

// Renders through the exact same generic MetrixViewSurface /metrix's
// MetrixConversation uses for the text path — applying a newer delivered
// TurnResult the same content-blind way (react only to resultDelivery.
// version, never to what capability/presentation type it actually is).
// This standalone trust-boundary test page shares the transport
// (useVoiceSession) with the main app; it was previously the only place
// that even rendered a delivered directive, since the main app's own
// mic button never consumed the delivery at all — MetrixConversation now
// does too (see MetrixConversation.tsx), so there is exactly one voice
// result renderer, not two.
function VoiceSessionClientBody() {
  const {
    state,
    start,
    stop,
    audioRef,
    resultDelivery
  } = useVoiceSession();

  const [presentation, setPresentation] = useState<Presentation | null>(null);

  useEffect(() => {
    const [latest] = resultDelivery.turnResult?.presentations ?? [];
    setPresentation(latest ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultDelivery.version]);

  const connected =
    state.phase ===
      "connected";

  const busy =
    state.phase ===
      "requesting_microphone"
    || state.phase ===
      "negotiating";

  const status =
    voiceStatusLabel(
      state
    );

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

      <MetrixViewSurface presentation={presentation} />
    </main>
  );
}
