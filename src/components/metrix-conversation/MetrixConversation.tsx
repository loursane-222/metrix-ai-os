"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";

import { ExecutiveFacePresence } from "../executive-presence/ExecutiveFacePresence";
import { MetrixEcosystemField } from "../metrix-tab/MetrixEcosystemField";
import { useVoiceSession, voiceStatusLabel } from "../../app/voice/voice-session-client";
import { MetrixViewSurface } from "../metrix-view/MetrixViewSurface";
import type { Presentation } from "../../lib/presentation/contracts";
import {
  TURN_FAILED_NOTICE,
  TURN_INCOMPLETE_NOTICE,
  interpretMetrixTurnResponse
} from "../../lib/metrix-client/turn-response";

type Message = {
  id?: string;
  role: "metrix" | "user";
  content: string;
};

const GREETING: Message = {
  role: "metrix",
  content: "Bugün şirketiniz için ne üzerinde çalışmak istiyorsunuz?"
};

const CONVERSATION_STORAGE_KEY = "metrix-chat-conversation-id";

export type MetrixConversationHandle = {
  startNewConversation: () => void;
  resumeConversation: (conversationId: string) => void;
};

/**
 * NEXT-native rewrite of the approved metrix-ai-os MetrixChatTab: same
 * metrix-main-experience/metrix-main-conversation/metrix-main-composer
 * markup, same MetrixBubble/UserBubble/ThinkingBubble/ErrorNote bubbles,
 * same composer bar and icon set — wired to NEXT's own non-streaming
 * /api/metrix turn endpoint instead of the legacy voice orchestrator,
 * conversation-extensions navigation runtime, daily-briefing/approval/
 * attachment/import/brand-film pipelines (all out of this operation's
 * scope). Text and voice render through the exact same MetrixViewSurface:
 * a text turn sets `presentation` from its own turnResult, and a Live
 * voice delivery (useVoiceSession's resultDelivery) applies the newest
 * presentation from its own turnResult the same content-blind way,
 * whichever surface produced it last.
 */
export const MetrixConversation = forwardRef<MetrixConversationHandle>(
  function MetrixConversation(_props, ref) {
    const [messages, setMessages] = useState<Message[]>([GREETING]);
    const [draft, setDraft] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [presentation, setPresentation] = useState<Presentation | null>(null);

    const conversationIdRef = useRef<string | undefined>(undefined);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const conversationScrollRef = useRef<HTMLDivElement | null>(null);
    const presentationSurfaceRef = useRef<HTMLDivElement | null>(null);

    const voice = useVoiceSession();

    useEffect(() => {
      const stored = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
      if (stored) conversationIdRef.current = stored;
    }, []);

    // A provider OAuth redirect (see /api/integrations/nylas/callback)
    // lands the browser back here with ?nylas=connected|error. The
    // callback route has already deterministically verified the
    // connection server-side — this just continues the same
    // conversation so METRIX narrates the real outcome through
    // integration_status, instead of a raw Settings-style banner. The
    // query param is stripped immediately so a refresh never re-fires it.
    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const nylasResult = params.get("nylas");
      if (nylasResult !== "connected" && nylasResult !== "error") return;

      window.history.replaceState(null, "", window.location.pathname);

      void send(
        nylasResult === "connected"
          ? "Az önce Google bağlantısını tamamladım, durumunu kontrol eder misin?"
          : "Google bağlantısını tamamlamaya çalıştım ama bir sorun oldu, durumu kontrol eder misin?"
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Applies the newest Live-delivered presentation the same content-blind
    // way the text path applies its own turnResult below — reacts only to
    // resultDelivery.version, never to which capability/domain produced it.
    useEffect(() => {
      const [latest] = voice.resultDelivery.turnResult?.presentations ?? [];
      if (latest) setPresentation(latest);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [voice.resultDelivery.version]);

    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isThinking]);

    // The conversation-text fade (globals.css, .metrix-main-conversation
    // mask-image) is viewport-anchored so it stays lined up with the hub
    // graphic as content scrolls — it has to live on the actual scroll
    // container to do that. A Presentation surface (table/list/entity/
    // calendar/document) renders inside that same scrolled flow but must
    // never fade, so a second, always-opaque mask layer is carved out at
    // the surface's live on-screen rect via two CSS custom properties,
    // recomputed on scroll/resize/content change. No presentation → the
    // hole collapses to zero height and the layer is a no-op.
    const syncPresentationMaskHole = useCallback(() => {
      const container = conversationScrollRef.current;
      if (!container) return;

      const surface = presentation ? presentationSurfaceRef.current : null;

      if (!surface) {
        container.style.setProperty("--metrix-presentation-hole-h", "0px");
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();

      container.style.setProperty(
        "--metrix-presentation-hole-y",
        `${surfaceRect.top - containerRect.top}px`
      );
      container.style.setProperty(
        "--metrix-presentation-hole-h",
        `${surfaceRect.height}px`
      );
    }, [presentation]);

    useEffect(() => {
      syncPresentationMaskHole();
    }, [syncPresentationMaskHole, messages, isThinking]);

    useEffect(() => {
      const container = conversationScrollRef.current;
      if (!container) return;

      container.addEventListener("scroll", syncPresentationMaskHole, {
        passive: true
      });
      window.addEventListener("resize", syncPresentationMaskHole);

      return () => {
        container.removeEventListener("scroll", syncPresentationMaskHole);
        window.removeEventListener("resize", syncPresentationMaskHole);
      };
    }, [syncPresentationMaskHole]);

    const send = useCallback(
      async (overrideText?: string) => {
        const text = (overrideText ?? draft).trim();
        if (!text || isThinking) return;

        setDraft("");
        setError(null);

        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setIsThinking(true);

        try {
          const response = await fetch("/api/metrix", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: text,
              turnId: crypto.randomUUID(),
              conversationId: conversationIdRef.current
            })
          });

          if (response.status === 401) {
            window.location.href = "/login";
            return;
          }

          // Parsing is separate from the HTTP status: a non-JSON body (a bare
          // 5xx) is a failed turn, not a lost connection.
          let payload: unknown = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }

          const turn = interpretMetrixTurnResponse({
            httpOk: response.ok,
            payload
          });

          if (turn.kind === "incomplete_committed") {
            // The server saved the work but the turn did not finish. Show the
            // canonical presentation and a runtime status — never a chat
            // answer — and do not invite a resend.
            if (turn.presentation) setPresentation(turn.presentation);
            setError(TURN_INCOMPLETE_NOTICE);
            window.dispatchEvent(new Event("metrix:notifications-refresh"));
            return;
          }

          if (turn.kind === "failed") {
            setError(TURN_FAILED_NOTICE);
            return;
          }

          if (turn.conversationId) {
            conversationIdRef.current = turn.conversationId;
            window.localStorage.setItem(
              CONVERSATION_STORAGE_KEY,
              turn.conversationId
            );
          }

          setMessages((prev) => [
            ...prev,
            { role: "metrix", content: turn.executiveText }
          ]);
          setPresentation(turn.presentation);
          // A verified business mutation in this turn may have produced a
          // canonical notification; let the toast fetch it right away.
          window.dispatchEvent(new Event("metrix:notifications-refresh"));
        } catch {
          setError("Bağlantı hatası. Tekrar deneyin.");
        } finally {
          setIsThinking(false);
        }
      },
      [draft, isThinking]
    );

    const startNewConversation = useCallback(() => {
      conversationIdRef.current = undefined;
      window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
      setMessages([GREETING]);
      setError(null);
    }, []);

    const resumeConversation = useCallback((conversationId: string) => {
      conversationIdRef.current = conversationId;
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, conversationId);
      setMessages([GREETING]);
      setError(null);
    }, []);

    useImperativeHandle(
      ref,
      () => ({ startNewConversation, resumeConversation }),
      [startNewConversation, resumeConversation]
    );

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void send();
      }
    };

    return (
      <div className="metrix-main-experience relative flex h-full flex-col text-[#f4f7f8] [color-scheme:dark] metrix-atmosphere metrix-atmosphere-neutral">
        <MetrixEcosystemField />
        <div
          className="metrix-main-conversation min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-7"
          data-conversation-main
          ref={conversationScrollRef}
        >
          <div className="mx-auto w-full max-w-3xl space-y-2.5">
            <ExecutiveFacePresence state={isThinking ? "thinking" : "idle"} />
            {messages.map((msg, i) =>
              msg.role === "metrix" ? (
                <MetrixBubble key={msg.id ?? i} text={msg.content} />
              ) : (
                <UserBubble key={msg.id ?? i} text={msg.content} />
              )
            )}
            {isThinking ? <ThinkingBubble /> : null}
            {error && !isThinking ? <ErrorNote message={error} /> : null}
            {presentation ? (
              <div ref={presentationSurfaceRef}>
                <MetrixViewSurface presentation={presentation} />
              </div>
            ) : null}
          </div>
          <div ref={messagesEndRef} />
        </div>

        <div className="metrix-main-composer shrink-0 px-4 pt-3" data-conversation-composer>
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[24px] bg-white/[0.055] px-2 py-2 shadow-[0_18px_50px_rgba(0,0,0,.3)] ring-1 ring-white/10 focus-within:ring-[#34e6cf]/45">
            <button
              aria-label="Dosya ekle"
              className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[.14] text-[#9aa7b0] transition hover:border-white/[.24] hover:bg-white/[.05] hover:text-[#c9d1d6] active:bg-white/[.08]"
              disabled={isThinking}
              type="button"
            >
              <SvgPlus />
            </button>

            <textarea
              className="min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] font-medium leading-[1.5] text-[#f4f7f8] outline-none placeholder:text-[#5c6673] disabled:opacity-50"
              disabled={isThinking}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isThinking ? "Metrix yanıtlıyor..." : "Metrix ile konuş..."}
              ref={textareaRef}
              rows={1}
              value={draft}
            />

            {draft.trim() && !isThinking ? (
              <button
                aria-label="Gönder"
                className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#C9BFA8] text-[#14120F] transition hover:bg-[#DDD4BE] active:bg-[#C9BFA8]"
                onClick={() => void send()}
                type="button"
              >
                <SvgArrowUp />
              </button>
            ) : (
              <button
                aria-label={
                  voice.state.phase === "requesting_microphone"
                    ? "Toplantıya bağlanıyor"
                    : voice.state.phase === "connected"
                      ? "Dinleniyor — durdurmak için dokun"
                      : voice.state.phase === "negotiating"
                        ? "METRIX bağlanıyor — durdurmak için dokun"
                        : "Toplantıya başla"
                }
                className={`mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${
                  voice.state.phase === "requesting_microphone"
                    ? "animate-pulse bg-[#1c6e73] text-white"
                    : voice.state.phase === "connected" || voice.state.phase === "negotiating"
                      ? "bg-[#1C1914] text-[#EDE7D9] ring-2 ring-[#C9BFA8] ring-offset-1 ring-offset-[#14120F]"
                      : "bg-[#1C1914] text-[#EDE7D9] hover:bg-[#1C1914] active:bg-[#0a151c]"
                }`}
                disabled={isThinking || voice.state.phase === "requesting_microphone"}
                onClick={() => {
                  if (voice.state.phase === "connected" || voice.state.phase === "negotiating") {
                    voice.stop();
                  } else {
                    void voice.start();
                  }
                }}
                type="button"
              >
                <SvgMic />
              </button>
            )}
          </div>
          {voice.state.phase !== "idle" && voice.state.phase !== "closed" ? (
            <p
              aria-live="polite"
              className={`px-2 pt-2 text-center text-[12px] font-medium ${
                voice.state.phase === "recoverable_error" ? "text-[#f0a090]" : "text-[#EDE7D9]"
              }`}
            >
              {voiceStatusLabel(voice.state)}
            </p>
          ) : null}
          <audio ref={voice.audioRef} autoPlay hidden />
        </div>
      </div>
    );
  }
);

function MetrixBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-4" data-message-role="metrix">
      <span className="w-16 shrink-0 pt-px text-[11px] font-bold uppercase tracking-[.04em] text-[#30d8ed]">METRIX</span>
      <div className="max-w-[68ch]">
        <p className="whitespace-pre-line text-[14px] font-medium leading-[1.45] text-[#cbd2df]">{text}</p>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-4" data-message-role="user">
      <span className="w-16 shrink-0 pt-px text-[11px] font-semibold uppercase tracking-[.04em] text-[#8994a9]">SİZ</span>
      <p className="max-w-[68ch] text-[14px] font-medium leading-[1.45] text-[#e4e7ed]">{text}</p>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-[#c8a878] [animation-delay:0ms]" />
        <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-[#c8a878] [animation-delay:200ms]" />
        <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-[#c8a878] [animation-delay:400ms]" />
        <span className="ml-1 text-[14px] font-medium text-[#c8a878]">Değerlendiriyor...</span>
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-[12px] border border-[#e8d8cc] bg-[#fff5f0] px-4 py-3 text-[13px] font-medium text-[#8a4030]">
      {message}
    </p>
  );
}

function SvgPlus() {
  return (
    <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SvgArrowUp() {
  return (
    <svg fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" viewBox="0 0 24 24" width="15">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function SvgMic() {
  return (
    <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="20">
      <rect height="11" rx="3" width="6" x="9" y="2" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
    </svg>
  );
}
