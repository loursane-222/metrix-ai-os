"use client";

import { useEffect, useRef, useState } from "react";

import { useExecutivePresence } from "@/components/executive-presence/ExecutivePresenceContext";
import { useVoiceExperienceOrchestrator } from "./voice/useVoiceExperienceOrchestrator";
import { shouldSkipHttpVoicePipeline } from "@/lib/voice/voice-native-realtime-flag";
import { executeActiveConversationExtension } from "@/lib/conversation-extensions/active-conversation-extension";
import {
  createConversationViewportState,
  createFrameScheduler,
  finishAssistantMessage,
  recordConversationScroll,
  restoreConversation,
  revealLatestUserMessage,
  startAssistantMessage,
  updateAssistantMessage,
  type ConversationViewportDecision,
  type FrameScheduler,
} from "./conversationViewport";

type ApiResponse<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: { message: string }; status?: number };

type ApiPost = <T = unknown>(
  path: string,
  body: Record<string, unknown>,
) => Promise<ApiResponse<T>>;

type Message = { role: "metrix" | "user"; content: string };

type ConversationSummary = { id: string; title: string; lastMessageAt: string };

type AiChatData = {
  conversationId: string;
  ai: { content: string; provider: string; model: string };
};

const GREETING: Message = {
  role: "metrix",
  content: "Merhaba Murat.\nBugün şirketimiz için ne üzerinde çalışmak istiyoruz?",
};

const CONVERSATION_STORAGE_KEY = "metrix-chat-conversation-id";

const ATTACH_OPTIONS: Array<{ label: string; Icon: () => React.ReactElement }> = [
  { label: "Dosya Yükle", Icon: SvgFile },
  { label: "Fotoğraf Çek", Icon: SvgCamera },
  { label: "Fotoğraf Seç", Icon: SvgPhoto },
  { label: "Belge Tara", Icon: SvgScan },
];

export function MetrixChatTab({ apiPost }: { apiPost: ApiPost }) {
  const { publishPresenceEvent } = useExecutivePresence();
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [micPermission, setMicPermission] = useState<
    "idle" | "requesting" | "granted" | "denied"
  >("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const viewportStateRef = useRef(createConversationViewportState());
  const viewportFrameRef = useRef<FrameScheduler | null>(null);
  const assistantGenerationRef = useRef(0);
  const activeTextGenerationRef = useRef<number | null>(null);
  const activeVoiceRevealGenerationRef = useRef<number | null>(null);
  const pendingBufferRef = useRef<string>("");
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Finalized voice-turn content, held until the orchestrator reports
  // playback actually finished — committing it to `messages` any earlier
  // would show the full text while audio is still catching up.
  const pendingVoiceMessageRef = useRef<{ content: string } | null>(null);
  // The /api/ai/chat request currently being read by send()'s stream loop.
  // Aborted on voice barge-in (via onInterrupt below) so a cut-off response
  // stops producing chunks instead of continuing to generate in the
  // background after playback has already stopped.
  const activeRequestRef = useRef<AbortController | null>(null);
  // Native Realtime can finish a reply it started while the finalized
  // transcript is being classified. A handled surface turn owns the sole
  // transcript result, so that corresponding native reply must not also be
  // committed as a second METRIX bubble.
  const suppressNextNativeAssistantRef = useRef(false);
  const orchestrator = useVoiceExperienceOrchestrator(
    (text) => {
      void send(text, true);
    },
    (revealedTextAtInterrupt) => {
      activeRequestRef.current?.abort();
      // A full response for this turn may already be sitting here (arrived
      // via "done" while TTS was still draining its last sentence) — an
      // interrupt supersedes it, so it must not land later as a duplicate.
      pendingVoiceMessageRef.current = null;
      suppressNextNativeAssistantRef.current = false;
      const heard = revealedTextAtInterrupt.trim();
      if (heard) {
        setMessages((prev) => [...prev, { role: "metrix", content: heard }]);
        startNewAssistantMessage();
      }
    },
    // Faz 1A.2 — Native Voice Runtime. Fires once per native turn that
    // completes normally (barge-in is already handled above via onInterrupt
    // — see that callback and cancelActiveResponse). Reuses the exact same
    // commit mechanism the HTTP voice path already uses: stash the finished
    // text here, and the effect below (which watches
    // orchestrator.presence === "listening") commits it into `messages`.
    // This is what makes the native assistant's spoken reply actually
    // appear in the permanent chat history — previously it only ever lived
    // in orchestrator.revealedText, which stops rendering the instant
    // presence leaves "speaking" (see the JSX below), and nothing else ever
    // populated pendingVoiceMessageRef for the native path.
    (finalText) => {
      if (suppressNextNativeAssistantRef.current) {
        suppressNextNativeAssistantRef.current = false;
        return;
      }
      const text = finalText.trim();
      if (text) {
        pendingVoiceMessageRef.current = { content: text };
      }
    },
  );
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ConversationSummary[] | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  function applyViewportDecision(decision: ConversationViewportDecision) {
    if (decision === "no-op" || decision === "preserve-user-position") return;
    viewportFrameRef.current?.request(() => {
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  function transitionViewport(
    transition: ReturnType<typeof startAssistantMessage>,
  ) {
    viewportStateRef.current = transition.state;
    applyViewportDecision(transition.decision);
  }

  function startNewAssistantMessage(): number {
    const generation = ++assistantGenerationRef.current;
    transitionViewport(startAssistantMessage(viewportStateRef.current, generation));
    return generation;
  }

  function revealLatestUserMessageInViewport() {
    transitionViewport(revealLatestUserMessage(viewportStateRef.current));
  }

  function finishActiveTextMessage() {
    const generation = activeTextGenerationRef.current;
    activeTextGenerationRef.current = null;
    if (generation !== null) {
      transitionViewport(finishAssistantMessage(viewportStateRef.current, generation));
    }
  }

  useEffect(() => {
    viewportFrameRef.current = createFrameScheduler(requestAnimationFrame, cancelAnimationFrame);
    return () => viewportFrameRef.current?.cancel();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  // Stop reading an in-flight /api/ai/chat response if the tab unmounts —
  // otherwise its reader loop keeps running against a component that can no
  // longer accept the chunks.
  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
      stopTypingInterval();
    };
  }, []);

  useEffect(() => {
    const generation = activeTextGenerationRef.current;
    if (streamingContent === null || generation === null) return;
    transitionViewport(updateAssistantMessage(viewportStateRef.current, generation));
    // The viewport helpers operate exclusively on refs; content is the render signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingContent]);

  useEffect(() => {
    if (orchestrator.presence.kind !== "speaking" || !orchestrator.revealedText) {
      if (orchestrator.presence.kind !== "speaking") {
        activeVoiceRevealGenerationRef.current = null;
      }
      return;
    }
    const generation = activeVoiceRevealGenerationRef.current;
    if (generation === null) {
      activeVoiceRevealGenerationRef.current = startNewAssistantMessage();
      return;
    }
    transitionViewport(updateAssistantMessage(viewportStateRef.current, generation));
    // The viewport helpers operate exclusively on refs; voice state is the render signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator.presence.kind, orchestrator.revealedText]);

  // Commit the finalized voice response into history only once the
  // orchestrator reports playback actually finished (presence → listening).
  useEffect(() => {
    if (orchestrator.presence.kind !== "listening") return;
    const pending = pendingVoiceMessageRef.current;
    if (!pending) return;
    pendingVoiceMessageRef.current = null;
    setMessages((prev) => [...prev, { role: "metrix", content: pending.content }]);
    startNewAssistantMessage();
    // Commit is intentionally keyed only to the orchestrator presence transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator.presence]);

  async function loadConversation(id: string, signal?: AbortSignal): Promise<boolean> {
    try {
      const response = await fetch(`/api/conversations/${id}/messages`, {
        credentials: "include",
        signal,
      });
      const json = (await response.json()) as ApiResponse<{ messages: Message[] }>;
      if (signal?.aborted || !json.ok || json.data.messages.length === 0) return false;
      setMessages(json.data.messages);
      setConversationId(id);
      sessionStorage.setItem(CONVERSATION_STORAGE_KEY, id);
      transitionViewport(restoreConversation(viewportStateRef.current));
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    const storedId = sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
    if (!storedId) return;

    const controller = new AbortController();
    (async () => {
      await loadConversation(storedId, controller.signal);
    })();

    return () => {
      controller.abort();
    };
  }, []);

  function openHistory() {
    setIsHistoryOpen(true);
    setIsHistoryLoading(true);
    (async () => {
      try {
        const response = await fetch("/api/conversations", { credentials: "include" });
        const json = (await response.json()) as ApiResponse<{ conversations: ConversationSummary[] }>;
        setHistoryItems(json.ok ? json.data.conversations : []);
      } catch {
        setHistoryItems([]);
      } finally {
        setIsHistoryLoading(false);
      }
    })();
  }

  async function selectHistoryItem(id: string) {
    setIsHistoryOpen(false);
    setError(null);
    setStreamingContent(null);
    finishActiveTextMessage();
    pendingBufferRef.current = "";
    stopTypingInterval();
    await loadConversation(id);
  }

  function startTypingInterval() {
    if (typingIntervalRef.current !== null) return;
    typingIntervalRef.current = setInterval(() => {
      if (!pendingBufferRef.current) return;
      const chars = pendingBufferRef.current.slice(0, 6);
      pendingBufferRef.current = pendingBufferRef.current.slice(6);
      setStreamingContent((prev) => (prev ?? "") + chars);
    }, 16);
  }

  function stopTypingInterval() {
    if (typingIntervalRef.current !== null) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }

  async function send(overrideText?: string, isVoice = false) {
    const text = (overrideText ?? draft).trim();
    if (!text || isThinking) return;

    const extensionResult = await executeActiveConversationExtension({
      utterance: text,
      source: isVoice ? "voice" : "written",
    });
    if (extensionResult.duplicate) return;

    if (extensionResult.status !== "NOT_HANDLED") {
      if (shouldSkipHttpVoicePipeline(isVoice)) {
        suppressNextNativeAssistantRef.current = true;
      }
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        ...(extensionResult.message ? [{ role: "metrix" as const, content: extensionResult.message }] : []),
      ]);
      setDraft("");
      if (extensionResult.message) startNewAssistantMessage();
      else revealLatestUserMessageInViewport();
      return;
    }

    // Faz 1A.1 — Native Voice Runtime: the realtime session itself
    // generates and speaks the assistant's reply (see
    // useVoiceChatConnection.ts's response.* handling) — the existing HTTP
    // /api/ai/chat request and the TTS pipeline below are intentionally
    // never invoked for this turn, so only one assistant reply is ever
    // produced. The user's own transcript still needs to be visible (per
    // Faz 1A.1 scope), so the message bubble is still added here. Text-mode
    // chat and native-mode-off voice are both unaffected — this branch is
    // only reachable when both isVoice and the flag are true.
    if (shouldSkipHttpVoicePipeline(isVoice)) {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setDraft("");
      revealLatestUserMessageInViewport();
      return;
    }

    // FAZ 5 (First Response Latency Trace) — diagnostic-only. No-ops for
    // text-mode sends and before beginTurn() has run (see logLatencyMark).
    if (isVoice) orchestrator.logLatencyMark("chat_send_started");

    // Supersede whatever request this turn's send() may still be inheriting
    // (e.g. a voice barge-in that aborted the previous turn but hasn't yet
    // cleared activeRequestRef) with this turn's own controller.
    activeRequestRef.current?.abort();
    const requestController = new AbortController();
    activeRequestRef.current = requestController;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setDraft("");
    setIsThinking(true);
    setError(null);
    setStreamingContent(null);
    pendingBufferRef.current = "";
    stopTypingInterval();
    revealLatestUserMessageInViewport();

    const body: Record<string, unknown> = { message: text };
    if (conversationId) body.conversationId = conversationId;
    if (isVoice) body.channel = "voice";

    const presenceCorrelationId = crypto.randomUUID();
    let presenceTurnEnded = false;

    function endPresenceTurn(
      outcome: "abort" | "completed" | "error",
      errorMessage?: string,
    ) {
      if (presenceTurnEnded) return;
      presenceTurnEnded = true;
      const timestamp = Date.now();

      publishPresenceEvent({
        type: "CONVERSATION_THINKING_ENDED",
        eventId: crypto.randomUUID(),
        source: "metrix-chat-conversation",
        timestamp,
        correlationId: presenceCorrelationId,
      });

      if (outcome === "completed") {
        publishPresenceEvent({
          type: "FEEDBACK_COMPLETED",
          eventId: crypto.randomUUID(),
          source: "metrix-chat-conversation",
          timestamp,
          correlationId: presenceCorrelationId,
        });
      } else if (outcome === "error") {
        publishPresenceEvent({
          type: "FEEDBACK_ERROR",
          eventId: crypto.randomUUID(),
          source: "metrix-chat-conversation",
          timestamp,
          correlationId: presenceCorrelationId,
          error: errorMessage ?? "Conversation response failed",
          errorCategory: "presentation_connection",
        });
      }
    }

    try {
      if (isVoice) orchestrator.logLatencyMark("chat_fetch_started");
      publishPresenceEvent({
        type: "CONVERSATION_THINKING_STARTED",
        eventId: crypto.randomUUID(),
        source: "metrix-chat-conversation",
        timestamp: Date.now(),
        correlationId: presenceCorrelationId,
      });
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: requestController.signal,
      });
      if (isVoice) orchestrator.logLatencyMark("chat_response_headers_received");

      // Capture conversationId as soon as headers arrive, not only from the
      // "done" event body. conversation.id is already known server-side
      // before a single chunk streams (see the X-Conversation-Id header in
      // route.ts/voice-v4-orchestrator.ts) — if this turn is later
      // barge-in-aborted before "done" ever fires, conversationId React
      // state would otherwise stay null, and the NEXT turn would silently
      // create a brand-new conversation instead of continuing this one
      // (FAZ 7 root cause).
      const headerConversationId = response.headers.get("X-Conversation-Id");
      if (headerConversationId) {
        setConversationId(headerConversationId);
        sessionStorage.setItem(CONVERSATION_STORAGE_KEY, headerConversationId);
      }

      if (!response.ok || !response.body) {
        endPresenceTurn("error", "Conversation request failed");
        setError("Metrix şu an yanıt veremiyor. Tekrar dener misin?");
        setIsThinking(false);
        if (isVoice) orchestrator.onStreamError();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function processStreamLine(line: string) {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === "chunk") {
            const content = String(event.content ?? "");
            setIsThinking(false);
            if (isVoice) {
              orchestrator.onChunk(content);
            } else {
              if (content && activeTextGenerationRef.current === null) {
                activeTextGenerationRef.current = startNewAssistantMessage();
              }
              pendingBufferRef.current += content;
              startTypingInterval();
            }
          } else if (event.type === "done") {
            endPresenceTurn("completed");
            stopTypingInterval();
            pendingBufferRef.current = "";
            const ai = (event.ai ?? {}) as { content?: string };
            const nextConversationId = String(event.conversationId ?? "");
            setConversationId(nextConversationId);
            if (nextConversationId) {
              sessionStorage.setItem(CONVERSATION_STORAGE_KEY, nextConversationId);
            }
            if (isVoice) {
              // Held until the orchestrator confirms playback finished —
              // see the effect that watches orchestrator.presence.
              pendingVoiceMessageRef.current = { content: ai.content ?? "" };
              orchestrator.onStreamDone();
            } else {
              setMessages((prev) => [...prev, { role: "metrix", content: ai.content ?? "" }]);
              setStreamingContent(null);
              const generation = activeTextGenerationRef.current;
              if (generation !== null) {
                finishActiveTextMessage();
              } else {
                startNewAssistantMessage();
              }
            }
          } else if (event.type === "error") {
            endPresenceTurn("error", String(event.message ?? "Conversation stream failed"));
            stopTypingInterval();
            pendingBufferRef.current = "";
            setError(String(event.message ?? "Metrix şu an yanıt veremiyor."));
            setStreamingContent(null);
            finishActiveTextMessage();
            if (isVoice) orchestrator.onStreamError();
          }
        } catch (error) {
          console.warn("[ChatStream] NDJSON line parse failed:", error, line);
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          processStreamLine(line);
        }
      }

      if (buffer.trim()) {
        processStreamLine(buffer);
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      endPresenceTurn(
        isAbort ? "abort" : "error",
        isAbort ? undefined : "Conversation request failed",
      );

      // A newer turn has already taken over activeRequestRef (e.g. voice
      // barge-in aborted this request and a new utterance's send() already
      // started) — that turn owns state now; this one must not touch it.
      if (activeRequestRef.current !== requestController) return;

      stopTypingInterval();
      pendingBufferRef.current = "";
      setStreamingContent(null);
      finishActiveTextMessage();
      // Abort is the expected outcome of a voice barge-in, not a failure —
      // interrupt() already moved presence/turn state to reflect it, so
      // surfacing an error or calling onStreamError here would fight that.
      if (!isAbort) {
        setError("Metrix şu an yanıt veremiyor. Tekrar dener misin?");
        if (isVoice) orchestrator.onStreamError();
      }
    }

    if (activeRequestRef.current !== requestController) return;
    setIsThinking(false);
  }

  async function handleMicClick() {
    if (micPermission === "requesting") return;

    if (orchestrator.isConnected) {
      orchestrator.stop();
      setMicPermission("idle");
      return;
    }

    setMicPermission("requesting");
    try {
      await orchestrator.start();
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const isVoiceListening =
    orchestrator.presence.kind === "listening" || orchestrator.presence.kind === "userSpeaking";
  const isVoiceResponding =
    orchestrator.presence.kind === "thinking" || orchestrator.presence.kind === "speaking";

  return (
    <div className="relative flex h-full flex-col bg-[#faf8f3]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-[#ece5d8] bg-[#faf8f3] px-5 pb-3 pt-14">
        <div className="flex items-center justify-between">
          <button
            aria-label="Sohbet Geçmişi"
            className="grid h-9 w-9 place-items-center rounded-full text-[#b8a898] transition active:bg-[#ece5d8]"
            onClick={openHistory}
            type="button"
          >
            <SvgHistory />
          </button>
          <div className="text-center">
            <MetrixWordmark className="mx-auto h-[14px] w-auto text-[#16100a]" />
            <p className="mt-[3px] text-[11px] font-medium tracking-wide text-[#b8a898]">
              AI Genel Müdür
            </p>
          </div>
          <button
            aria-label="Ayarlar"
            className="grid h-9 w-9 place-items-center rounded-full text-[#b8a898] transition active:bg-[#ece5d8]"
            type="button"
          >
            <SvgSettings />
          </button>
        </div>
      </header>

      {/* ── Messages ───────────────────────────────────────────────────── */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-7"
        onScroll={(event) => {
          const container = event.currentTarget;
          transitionViewport(
            recordConversationScroll(viewportStateRef.current, {
              clientHeight: container.clientHeight,
              scrollHeight: container.scrollHeight,
              scrollTop: container.scrollTop,
            }),
          );
        }}
        ref={messagesContainerRef}
      >
        <div className="space-y-7">
          {messages.map((msg, i) =>
            msg.role === "metrix" ? (
              <MetrixBubble key={i} text={msg.content} />
            ) : (
              <UserBubble key={i} text={msg.content} />
            ),
          )}
          {orchestrator.presence.kind === "thinking" ? (
            <ThinkingBubble />
          ) : orchestrator.presence.kind === "speaking" ? (
            <MetrixBubble text={orchestrator.revealedText} />
          ) : isThinking && streamingContent === null ? (
            <ThinkingBubble />
          ) : streamingContent !== null ? (
            <MetrixBubble text={streamingContent} />
          ) : null}
          {error && !isThinking ? <ErrorNote message={error} /> : null}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────── */}
      <div
        className="shrink-0 border-t border-[#ece5d8] bg-[#faf8f3] px-4 pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        <div className="flex items-end gap-2 rounded-[26px] bg-white px-2 py-2 shadow-[0_1px_18px_rgba(7,18,38,0.08)] ring-1 ring-[#e8e0d2]">
          <button
            aria-label="Dosya ekle"
            className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#d8cfc4] text-[#6a5a48] transition active:bg-[#f0e8dc]"
            disabled={isThinking}
            onClick={() => setIsAttachOpen(true)}
            type="button"
          >
            <SvgPlus />
          </button>

          <textarea
            className="min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] font-medium leading-[1.5] text-[#16100a] outline-none placeholder:text-[#c8bdb0] disabled:opacity-50"
            disabled={isThinking}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isThinking || (orchestrator.isConnected && isVoiceResponding)
                ? "Metrix yanıtlıyor..."
                : orchestrator.isConnected && isVoiceListening
                  ? "Dinleniyor..."
                  : "Metrix ile konuş..."
            }
            ref={textareaRef}
            rows={1}
            value={draft}
          />

          {draft.trim() && !isThinking ? (
            <button
              aria-label="Gönder"
              className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#16100a] text-white transition active:bg-[#3a2a18]"
              onClick={() => void send()}
              type="button"
            >
              <SvgArrowUp />
            </button>
          ) : (
            <button
              aria-label={
                micPermission === "requesting"
                  ? "Toplantıya bağlanıyor"
                  : orchestrator.isConnected && isVoiceListening
                    ? "Dinleniyor — durdurmak için dokun"
                    : orchestrator.isConnected && isVoiceResponding
                      ? "Metrix yanıtlıyor — durdurmak için dokun"
                      : "Toplantıya başla"
              }
              className={`mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${
                micPermission === "requesting"
                  ? "animate-pulse bg-[#8a5a2b] text-white"
                  : orchestrator.isConnected && isVoiceListening
                    ? "bg-[#16100a] text-white ring-2 ring-[#c8a878] ring-offset-1 ring-offset-white"
                    : "bg-[#16100a] text-white active:bg-[#3a2a18]"
              }`}
              disabled={isThinking || micPermission === "requesting"}
              onClick={() => void handleMicClick()}
              type="button"
            >
              <SvgMic />
            </button>
          )}
        </div>
        {micPermission === "requesting" ? (
          <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#8a5a2b]">
            Toplantıya bağlanıyor...
          </p>
        ) : orchestrator.connectionError ? (
          <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#8a4030]">
            {orchestrator.connectionError}
          </p>
        ) : orchestrator.isConnected && isVoiceListening ? (
          <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#8a5a2b]">
            Dinleniyor — konuşabilirsiniz
          </p>
        ) : micPermission === "denied" ? (
          <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#b8a898]">
            Toplantı başlatılamadı. Lütfen tekrar dene.
          </p>
        ) : null}
      </div>

      {/* ── Attachment Sheet ────────────────────────────────────────────── */}
      {isAttachOpen ? (
        <AttachmentSheet onClose={() => setIsAttachOpen(false)} />
      ) : null}

      {/* ── History Sheet ──────────────────────────────────────────────── */}
      {isHistoryOpen ? (
        <HistorySheet
          isLoading={isHistoryLoading}
          items={historyItems}
          onClose={() => setIsHistoryOpen(false)}
          onSelect={(id) => void selectHistoryItem(id)}
        />
      ) : null}
    </div>
  );
}

// ─── Message Bubbles ─────────────────────────────────────────────────────────

function MetrixBubble({ text }: { text: string }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#c8a878]">
        Metrix
      </p>
      <p className="whitespace-pre-line text-[17px] font-medium leading-[1.65] text-[#16100a]">
        {text}
      </p>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] rounded-[18px] rounded-tr-[5px] bg-[#16100a] px-4 py-3">
        <p className="text-[16px] font-medium leading-[1.55] text-white">{text}</p>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#c8a878]">
        Metrix
      </p>
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

// ─── Attachment Sheet ─────────────────────────────────────────────────────────

function AttachmentSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/15 backdrop-blur-[1.5px]"
        onClick={onClose}
      />
      <div
        className="relative rounded-t-[24px] bg-[#faf8f3] px-5 pt-4 shadow-[0_-6px_32px_rgba(7,18,38,0.10)]"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
      >
        <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-[#d8cfc4]" />
        <div className="grid grid-cols-4 gap-3">
          {ATTACH_OPTIONS.map(({ label, Icon }) => (
            <button
              className="flex flex-col items-center gap-2"
              key={label}
              onClick={onClose}
              type="button"
            >
              <span className="grid h-14 w-14 place-items-center rounded-[18px] border border-[#e4d8cc] bg-white shadow-[0_3px_10px_rgba(7,18,38,0.06)]">
                <Icon />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight text-[#6a5040]">
                {label}
              </span>
            </button>
          ))}
        </div>
        <button
          className="mt-4 flex h-12 w-full items-center justify-center rounded-[14px] border border-[#e4d8cc] text-[14px] font-bold text-[#8a5a2b] transition active:bg-[#f0e8dc]"
          onClick={onClose}
          type="button"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

// ─── History Sheet ────────────────────────────────────────────────────────────

function formatHistoryTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function HistorySheet({
  isLoading,
  items,
  onClose,
  onSelect,
}: {
  isLoading: boolean;
  items: ConversationSummary[] | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/15 backdrop-blur-[1.5px]"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[75vh] flex-col rounded-t-[24px] bg-[#faf8f3] px-5 pt-4 shadow-[0_-6px_32px_rgba(7,18,38,0.10)]"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
      >
        <div className="mx-auto mb-5 h-1 w-9 shrink-0 rounded-full bg-[#d8cfc4]" />
        <p className="mb-3 shrink-0 text-[11px] font-black uppercase tracking-[0.2em] text-[#b8a898]">
          Sohbet Geçmişi
        </p>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {isLoading ? (
            <p className="px-1 py-3 text-[13px] font-medium text-[#b8a898]">Yükleniyor...</p>
          ) : !items || items.length === 0 ? (
            <p className="px-1 py-3 text-[13px] font-medium text-[#b8a898]">
              Henüz geçmiş konuşma yok.
            </p>
          ) : (
            items.map((item) => (
              <button
                className="flex w-full flex-col items-start gap-1 rounded-[14px] border border-[#e4d8cc] bg-white px-4 py-3 text-left shadow-[0_2px_8px_rgba(7,18,38,0.05)] transition active:bg-[#f7f1e6]"
                key={item.id}
                onClick={() => onSelect(item.id)}
                type="button"
              >
                <span className="line-clamp-1 text-[14px] font-semibold text-[#16100a]">
                  {item.title}
                </span>
                <span className="text-[11px] font-medium text-[#b8a898]">
                  {formatHistoryTimestamp(item.lastMessageAt)}
                </span>
              </button>
            ))
          )}
        </div>
        <button
          className="mt-4 flex h-12 w-full shrink-0 items-center justify-center rounded-[14px] border border-[#e4d8cc] text-[14px] font-bold text-[#8a5a2b] transition active:bg-[#f0e8dc]"
          onClick={onClose}
          type="button"
        >
          Kapat
        </button>
      </div>
    </div>
  );
}

// ─── Brand ────────────────────────────────────────────────────────────────────

function MetrixWordmark({ className }: { className?: string }) {
  return (
    <svg
      aria-labelledby="metrixWordmarkTitle metrixWordmarkDesc"
      className={className}
      role="img"
      viewBox="0 0 1200 320"
    >
      <title id="metrixWordmarkTitle">METRIX Wordmark</title>
      <desc id="metrixWordmarkDesc">Official METRIX geometric wordmark.</desc>
      <defs>
        <filter height="160%" id="metrixWordmarkGlow" width="120%" x="-10%" y="-30%">
          <feGaussianBlur result="blur" stdDeviation="0.6" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <text
        fill="currentColor"
        filter="url(#metrixWordmarkGlow)"
        fontFamily="Arial Black, Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="178"
        fontWeight="900"
        letterSpacing="18"
        textAnchor="middle"
        x="600"
        y="208"
      >
        METRIX
      </text>
    </svg>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function SvgSettings() {
  return (
    <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="20">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function SvgHistory() {
  return (
    <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="20">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
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

function SvgFile() {
  return (
    <svg fill="none" height="26" stroke="#8a5a2b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="26">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function SvgCamera() {
  return (
    <svg fill="none" height="26" stroke="#8a5a2b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="26">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function SvgPhoto() {
  return (
    <svg fill="none" height="26" stroke="#8a5a2b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="26">
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function SvgScan() {
  return (
    <svg fill="none" height="26" stroke="#8a5a2b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="26">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect height="8" rx="1" width="8" x="8" y="8" />
    </svg>
  );
}
