"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useExecutivePresence } from "@/components/executive-presence/ExecutivePresenceContext";
import { useVoiceExperienceOrchestrator } from "./voice/useVoiceExperienceOrchestrator";
import { handoffHandledExtensionVoice } from "./voice/handledExtensionVoiceHandoff";
import { shouldSkipHttpVoicePipeline } from "@/lib/voice/voice-native-realtime-flag";
import { executeActiveConversationExtension } from "@/lib/conversation-extensions/active-conversation-extension";
import { ConversationSubmitController } from "./conversationSubmitController";
import { resolveTextResponseReadiness, type TextResponseStatusCategory } from "@/lib/conversation-understanding";
import { useFirstExperience } from "./first-experience/useFirstExperience";
import { decideConversationSessionBootstrap } from "./conversationSessionBootstrap";
import { PAGE_BACKGROUND } from "@/components/customers/ui";
import { BrandFilmPlayer } from "@/components/brand-film/BrandFilmPlayer";
import type { ApprovalLifecycleEnvelope, ExecutiveLifecycleEnvelope } from "@/lib/executive-lifecycle";
import { bindActiveAttachmentConversation, clearBrowserAttachmentSession, getActiveAttachment, setActiveAttachment, type AttachmentReference } from "@/lib/conversation-attachments/attachment-session";
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
type TransientStatus = { turnId: string; category: TextResponseStatusCategory; content: string };

type ConversationSummary = { id: string; title: string; lastMessageAt: string };

type AiChatData = {
  conversationId: string;
  ai: { content: string; provider: string; model: string };
};

const GREETING: Message = {
  role: "metrix",
  content: "Bugün şirketiniz için ne üzerinde çalışmak istiyorsunuz?",
};

const CONVERSATION_STORAGE_KEY = "metrix-chat-conversation-id";
const AUTH_SESSION_STORAGE_KEY = "metrix-chat-auth-session-id";

const ATTACH_OPTIONS: Array<{ label: string; Icon: () => React.ReactElement; accept: string; capture?: "environment" }> = [
  { label: "Dosya Yükle", Icon: SvgFile, accept: "image/jpeg,image/png,image/webp,application/pdf" },
  { label: "Fotoğraf Çek", Icon: SvgCamera, accept: "image/*", capture: "environment" },
  { label: "Fotoğraf Seç", Icon: SvgPhoto, accept: "image/*" },
];

export function MetrixChatTab({
  apiPost,
  presentation = "conversation",
  onClose,
}: {
  apiPost: ApiPost;
  presentation?: "conversation" | "command";
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { publishPresenceEvent } = useExecutivePresence();
  const {
    activitySnapshot,
    behaviorSnapshot,
    openFullConversation,
    publishLifecycleEnvelope,
  } = useExecutivePresence();
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const firstExperience = useFirstExperience();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [transientStatus, setTransientStatus] = useState<TransientStatus | null>(null);
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
  const submitControllerRef = useRef(new ConversationSubmitController());
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
      submitControllerRef.current.cancel();
      setIsThinking(false);
      // A done event is immutable even while TTS is still draining. Barge-in
      // may stop playback, but it must commit that completed response rather
      // than deleting it from conversation history.
      const completed = pendingVoiceMessageRef.current;
      pendingVoiceMessageRef.current = null;
      suppressNextNativeAssistantRef.current = false;
      const heard = revealedTextAtInterrupt.trim();
      const durableText = completed?.content.trim() || heard;
      if (durableText) {
        setMessages((prev) => [...prev, { role: "metrix", content: durableText }]);
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
  const [attachment, setAttachment] = useState<AttachmentReference | null>(null);
  const [isAttachmentUploading, setIsAttachmentUploading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ConversationSummary[] | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [approvalDecisionPending, setApprovalDecisionPending] = useState<string | null>(null);
  const [approvalDecisionError, setApprovalDecisionError] = useState<string | null>(null);
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showBrandFilm, setShowBrandFilm] = useState(false);

  useEffect(() => {
    if (presentation !== "command") return;
    const controller = new AbortController();
    void fetch("/api/executive/approvals", { credentials: "include", signal: controller.signal })
      .then((response) => response.json())
      .then((json: { ok: true; data: { approvals: ApprovalLifecycleEnvelope[] } } | { ok: false }) => {
        if (!json.ok) return;
        for (const envelope of json.data.approvals) publishLifecycleEnvelope(envelope);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setApprovalDecisionError("Onaylar yüklenemedi.");
      });
    void fetch("/api/executive/lifecycle", { credentials: "include", signal: controller.signal })
      .then((response) => response.json())
      .then((json: { ok: true; data: { envelopes: ExecutiveLifecycleEnvelope[] } } | { ok: false }) => {
        if (!json.ok) return;
        for (const envelope of json.data.envelopes) publishLifecycleEnvelope(envelope);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setApprovalDecisionError("Runtime aktivitesi yüklenemedi.");
      });
    return () => controller.abort();
  }, [behaviorSnapshot.updatedAt, presentation, publishLifecycleEnvelope]);

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

  useEffect(() => { if (conversationId && attachment) bindActiveAttachmentConversation(conversationId); }, [conversationId, attachment]);
  useEffect(() => { setAttachment(getActiveAttachment() ?? null); }, []);

  async function uploadAttachment(file: File) { setIsAttachOpen(false); setIsAttachmentUploading(true); setError(null); const form = new FormData(); form.set("file", file); if (conversationId) form.set("conversationId", conversationId); try { const response = await fetch("/api/customers/document-attachments", { method: "POST", credentials: "include", body: form }); const json = await response.json() as ApiResponse<AttachmentReference>; if (!json.ok) throw new Error(json.error.message); setAttachment(json.data); setActiveAttachment(json.data); } catch (cause) { setError(cause instanceof Error ? cause.message : "Belge yüklenemedi."); } finally { setIsAttachmentUploading(false); } }

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
    const submitController = submitControllerRef.current;
    return () => {
      activeRequestRef.current?.abort();
      submitController.cancel();
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
    if (firstExperience === undefined) return;
    const controller = new AbortController();
    (async () => {
      const previousAuthSessionId = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (!firstExperience?.authSessionId) return;
      const decision = decideConversationSessionBootstrap({
        previousAuthSessionId,
        authSessionId: firstExperience.authSessionId,
        storedConversationId: sessionStorage.getItem(CONVERSATION_STORAGE_KEY),
        firstExperienceActive: firstExperience.active,
        firstExperienceConversationId: firstExperience.conversationId,
        firstExperienceMessages: firstExperience.messages,
        dailyBrief: firstExperience.dailyBrief,
        greeting: GREETING,
      });
      sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, firstExperience.authSessionId);
      if (decision.clearStoredConversation) {
        sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
      }
      if (decision.initialMessages) {
        setMessages(decision.initialMessages);
      }
      if (decision.restoreConversationId) {
        const restored = await loadConversation(decision.restoreConversationId, controller.signal);
        if (!restored && decision.initialMessages) setMessages(decision.initialMessages);
        if (!restored) setConversationId(null);
      } else {
        setConversationId(null);
      }
      if (decision.initialMessages || decision.restoreConversationId) {
        transitionViewport(restoreConversation(viewportStateRef.current));
      }
    })();

    return () => {
      controller.abort();
    };
  }, [firstExperience]);

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
    activeRequestRef.current?.abort();
    submitControllerRef.current.cancel();
    orchestrator.stop();
    setIsHistoryOpen(false);
    setError(null);
    setStreamingContent(null);
    setTransientStatus(null);
    finishActiveTextMessage();
    pendingBufferRef.current = "";
    stopTypingInterval();
    await loadConversation(id);
  }

  function startNewConversation() {
    activeRequestRef.current?.abort();
    submitControllerRef.current.cancel();
    orchestrator.stop();
    stopTypingInterval();
    sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
    setConversationId(null);
    setMessages([GREETING]);
    setDraft("");
    setAttachment(null);
    clearBrowserAttachmentSession();
    setStreamingContent(null);
    setTransientStatus(null);
    setIsThinking(false);
    setError(null);
    pendingBufferRef.current = "";
    pendingVoiceMessageRef.current = null;
    finishActiveTextMessage();
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
    const claimedTurn = submitControllerRef.current.claim(text, isVoice ? "voice" : "written");
    if (!claimedTurn) return;
    const turn = claimedTurn;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setDraft("");
    setIsThinking(true);
    setError(null);
    setStreamingContent(null);
    const readiness = isVoice ? null : resolveTextResponseReadiness(text);
    setTransientStatus(readiness?.statusCategory && readiness.statusContent
      ? { turnId: turn.turnId, category: readiness.statusCategory, content: readiness.statusContent }
      : null);
    pendingBufferRef.current = "";
    stopTypingInterval();
    revealLatestUserMessageInViewport();

    const presenceCorrelationId = turn.turnId;
    let presenceTurnEnded = false;
    function endPresenceTurn(outcome: "abort" | "completed" | "error", errorMessage?: string) {
      if (presenceTurnEnded) return;
      presenceTurnEnded = true;
      const timestamp = Date.now();
      publishPresenceEvent({ type: "CONVERSATION_THINKING_ENDED", eventId: crypto.randomUUID(), source: "metrix-chat-conversation", timestamp, correlationId: presenceCorrelationId });
      if (outcome === "completed") publishPresenceEvent({ type: "FEEDBACK_COMPLETED", eventId: crypto.randomUUID(), source: "metrix-chat-conversation", timestamp, correlationId: presenceCorrelationId });
      else if (outcome === "error") publishPresenceEvent({ type: "FEEDBACK_ERROR", eventId: crypto.randomUUID(), source: "metrix-chat-conversation", timestamp, correlationId: presenceCorrelationId, error: errorMessage ?? "Conversation response failed", errorCategory: "presentation_connection" });
    }
    function finishSubmit(outcome: "abort" | "completed" | "error", errorMessage?: string) {
      if (!submitControllerRef.current.transition(turn, "COMPLETED")) return false;
      endPresenceTurn(outcome, errorMessage);
      setIsThinking(false);
      setTransientStatus((current) => current?.turnId === turn.turnId ? null : current);
      return true;
    }
    publishPresenceEvent({ type: "CONVERSATION_THINKING_STARTED", eventId: crypto.randomUUID(), source: "metrix-chat-conversation", timestamp: Date.now(), correlationId: presenceCorrelationId });

    let extensionResult;
    try {
      extensionResult = await executeActiveConversationExtension({ utterance: text, source: isVoice ? "voice" : "written", turnKey: turn.turnId });
    } catch {
      if (submitControllerRef.current.isCurrent(turn)) setError("Metrix şu an yanıt veremiyor. Tekrar dener misin?");
      finishSubmit("error", "Conversation extension failed");
      return;
    }
    if (!submitControllerRef.current.isCurrent(turn)) return;
    if (extensionResult.duplicate) { finishSubmit("abort"); return; }

    if (extensionResult.status !== "NOT_HANDLED") {
      handoffHandledExtensionVoice({
        source: isVoice ? "voice" : "written",
        message: extensionResult.message,
        duplicate: extensionResult.duplicate,
        nativeRealtime: shouldSkipHttpVoicePipeline(isVoice),
        suppressNativeAssistant: () => { suppressNextNativeAssistantRef.current = true; },
        speakDeterministicResponse: orchestrator.speakDeterministicResponse,
      });
      if (extensionResult.message) setMessages((prev) => [...prev, { role: "metrix", content: extensionResult.message! }]);
      if (extensionResult.message) startNewAssistantMessage();
      else revealLatestUserMessageInViewport();
      finishSubmit(extensionResult.status === "HANDLED_FAILED" ? "error" : "completed", extensionResult.message ?? undefined);
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
      revealLatestUserMessageInViewport();
      finishSubmit("completed");
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
    submitControllerRef.current.transition(turn, "RUNNING_AI");

    const body: Record<string, unknown> = { message: text };
    if (conversationId) body.conversationId = conversationId;
    if (isVoice) body.channel = "voice";

    try {
      if (isVoice) orchestrator.logLatencyMark("chat_fetch_started");
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
        setError("Metrix şu an yanıt veremiyor. Tekrar dener misin?");
        finishSubmit("error", "Conversation request failed");
        if (isVoice) orchestrator.onStreamError();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminalEventSeen = false;

      function processStreamLine(line: string) {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === "chunk") {
            const content = String(event.content ?? "");
            if (isVoice) {
              orchestrator.onChunk(content);
            } else {
              if (content && activeTextGenerationRef.current === null) {
                setTransientStatus((current) => current?.turnId === turn.turnId ? null : current);
                activeTextGenerationRef.current = startNewAssistantMessage();
              }
              pendingBufferRef.current += content;
              startTypingInterval();
            }
          } else if (event.type === "done") {
            finishSubmit("completed");
            setTransientStatus((current) => current?.turnId === turn.turnId ? null : current);
            terminalEventSeen = true;
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
            finishSubmit("error", String(event.message ?? "Conversation stream failed"));
            setTransientStatus((current) => current?.turnId === turn.turnId ? null : current);
            terminalEventSeen = true;
            stopTypingInterval();
            pendingBufferRef.current = "";
            setError(String(event.message ?? "Metrix şu an yanıt veremiyor."));
            setStreamingContent(null);
            finishActiveTextMessage();
            if (isVoice) orchestrator.onStreamError();
          }
        } catch (error) {
          console.warn("[ChatStream] NDJSON line parse failed:", error);
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
      if (!terminalEventSeen && submitControllerRef.current.isCurrent(turn)) {
        stopTypingInterval();
        pendingBufferRef.current = "";
        setStreamingContent(null);
        finishActiveTextMessage();
        setError("Metrix yanıtı tamamlanamadı. Tekrar dener misin?");
        finishSubmit("error", "Conversation stream ended without a terminal event");
        if (isVoice) orchestrator.onStreamError();
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      finishSubmit(isAbort ? "abort" : "error", isAbort ? undefined : "Conversation request failed");

      // A newer turn has already taken over activeRequestRef (e.g. voice
      // barge-in aborted this request and a new utterance's send() already
      // started) — that turn owns state now; this one must not touch it.
      if (activeRequestRef.current !== requestController) return;

      stopTypingInterval();
      pendingBufferRef.current = "";
      setStreamingContent(null);
      setTransientStatus((current) => current?.turnId === turn.turnId ? null : current);
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
    finishSubmit("completed");
  }

  async function handleMicClick() {
    if (micPermission === "requesting") return;

    if (orchestrator.isConnected) {
      orchestrator.stop();
      setMicPermission("idle");
      return;
    }

    if (micPermission === "idle") {
      setShowMicPrompt(true);
      return;
    }

    await startVoice();
  }

  async function startVoice() {
    setShowMicPrompt(false);

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

  function cancelActiveWork() {
    activeRequestRef.current?.abort();
    const cancelledTurn = submitControllerRef.current.cancel();
    if (orchestrator.isConnected) orchestrator.stop();
    if (cancelledTurn) publishPresenceEvent({ type: "CONVERSATION_THINKING_ENDED", eventId: crypto.randomUUID(), source: "metrix-chat-conversation", timestamp: Date.now(), correlationId: cancelledTurn.turnId });
    publishPresenceEvent({
      type: "SOURCE_RELEASED",
      eventId: crypto.randomUUID(),
      source: behaviorSnapshot.source ?? "metrix-chat-conversation",
      timestamp: Date.now(),
      ...(behaviorSnapshot.scopeId ? { scopeId: behaviorSnapshot.scopeId } : {}),
    });
    setIsThinking(false);
    setStreamingContent(null);
    setTransientStatus(null);
    setError(null);
  }

  async function decideApprovalFromPanel(approvalId: string, decision: "approve" | "reject") {
    if (approvalDecisionPending) return;
    setApprovalDecisionPending(approvalId);
    setApprovalDecisionError(null);
    try {
      const response = await fetch(`/api/executive/approvals/${encodeURIComponent(approvalId)}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await response.json() as
        | { ok: true; data: { envelope: ApprovalLifecycleEnvelope } }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      publishLifecycleEnvelope(json.data.envelope);
    } catch (cause) {
      setApprovalDecisionError(cause instanceof Error ? cause.message : "Onay kararı uygulanamadı.");
    } finally {
      setApprovalDecisionPending(null);
    }
  }

  const isVoiceListening =
    orchestrator.presence.kind === "listening" || orchestrator.presence.kind === "userSpeaking";
  const isVoiceResponding =
    orchestrator.presence.kind === "thinking" || orchestrator.presence.kind === "speaking";

  if (presentation === "command") {
    const moduleLabel = pathname.split("/").filter(Boolean)[1] ?? "workspace";
    const busy = behaviorSnapshot.status !== "idle"
      && behaviorSnapshot.status !== "completed"
      && behaviorSnapshot.status !== "error";

    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#0d1218] text-[#f4f7f8]">
        <div className="border-b border-white/[0.08] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#55dce3]">
                {moduleLabel} · Executive command
              </p>
              <p aria-live="polite" className="mt-0.5 text-xs text-[#9ba8b2]">
                {behaviorSnapshot.status === "idle" ? "Hazır" : behaviorSnapshot.reason ?? behaviorSnapshot.status}
              </p>
            </div>
            <button
              aria-label="Executive composer'ı kapat"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#b7c1c8] hover:bg-white/[0.08]"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.055] p-2 focus-within:border-[#35dce3]/50">
            <textarea
              aria-label="Metrix komutu"
              autoFocus
              className="max-h-[96px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[16px] leading-6 text-white outline-none placeholder:text-[#6f7d87]"
              disabled={isThinking}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isVoiceListening ? "Dinleniyor…" : "Ne yapmamı istiyorsunuz?"}
              ref={textareaRef}
              rows={1}
              value={draft}
            />
            <button
              aria-label={orchestrator.isConnected ? "Sesli komutu durdur" : "Sesli komutu başlat"}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${isVoiceListening ? "bg-[#35dce3] text-[#071417]" : "bg-white/10 text-white"}`}
              disabled={micPermission === "requesting"}
              onClick={() => void handleMicClick()}
              type="button"
            >
              <SvgMic />
            </button>
            <button
              aria-label="Komutu gönder"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#35dce3] text-[#071417] disabled:opacity-40"
              disabled={!draft.trim() || isThinking}
              onClick={() => void send()}
              type="button"
            >
              <SvgArrowUp />
            </button>
          </div>
          {orchestrator.connectionError ? (
            <p className="mt-2 text-xs text-[#ff9b8d]">{orchestrator.connectionError}</p>
          ) : null}
          <div className="mt-2 flex items-center justify-between">
            <button
              className="text-xs font-medium text-[#aab6be] hover:text-white disabled:opacity-40"
              disabled={!busy && !orchestrator.isConnected}
              onClick={cancelActiveWork}
              type="button"
            >
              İptal
            </button>
            <button
              className="text-xs font-semibold text-[#55dce3] hover:text-[#8debf0]"
              onClick={openFullConversation}
              type="button"
            >
              Full conversation →
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-testid="executive-activity-panel">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Executive Activity</h2>
            <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] uppercase tracking-wider text-[#9ba8b2]">
              {activitySnapshot.outcome ?? behaviorSnapshot.status}
            </span>
          </div>
          {activitySnapshot.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-[#7f8c96]">
              Bir komut verdiğinizde yalnız gerçek runtime adımları burada görünür.
            </p>
          ) : (
            <ol aria-live="polite" className="space-y-2">
              {activitySnapshot.items.map((item) => (
                <li
                  className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3"
                  data-activity-kind={item.kind}
                  key={item.id}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      item.status === "active" ? "animate-pulse bg-[#35dce3] motion-reduce:animate-none"
                        : item.status === "failed" ? "bg-[#ff7466]"
                          : item.status === "cancelled" ? "bg-[#8d99a2]" : "bg-[#63d29a]"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#e8edef]">{item.label}</p>
                    {item.reason ? <p className="mt-1 text-xs text-[#9ba8b2]">{item.reason}</p> : null}
                    {item.error ? <p className="mt-1 text-xs text-[#ff9b8d]">{item.error}</p> : null}
                    {item.lifecycle?.source === "approval"
                      && item.lifecycle.phase === "awaiting_decision"
                      && item.lifecycle.approval.currentStatus === "PENDING" ? (
                        <div className="mt-3 flex gap-2">
                          <button
                            className="rounded-lg bg-[#35dce3] px-3 py-1.5 text-xs font-semibold text-[#071417] disabled:opacity-40"
                            disabled={approvalDecisionPending === item.lifecycle.approval.approvalId}
                            onClick={() => {
                              const lifecycle = item.lifecycle;
                              if (lifecycle?.source === "approval") void decideApprovalFromPanel(lifecycle.approval.approvalId, "approve");
                            }}
                            type="button"
                          >
                            Onayla
                          </button>
                          <button
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                            disabled={approvalDecisionPending === item.lifecycle.approval.approvalId}
                            onClick={() => {
                              const lifecycle = item.lifecycle;
                              if (lifecycle?.source === "approval") void decideApprovalFromPanel(lifecycle.approval.approvalId, "reject");
                            }}
                            type="button"
                          >
                            Reddet
                          </button>
                        </div>
                      ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {error ? <ErrorNote message={error} /> : null}
          {approvalDecisionError ? <ErrorNote message={approvalDecisionError} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col text-[#f4f7f8] [color-scheme:dark]" style={{ background: PAGE_BACKGROUND }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/[0.08] bg-[#061018]/80 px-5 pb-3 pt-[max(18px,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <button
            aria-label="Sohbet Geçmişi"
            className="grid h-9 w-9 place-items-center rounded-full text-[#93a0ad] transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34e6cf]"
            onClick={openHistory}
            type="button"
          >
            <SvgHistory />
          </button>
          <div className="text-center">
            <MetrixWordmark className="mx-auto h-[14px] w-auto text-[#f4f7f8]" />
            <p className="mt-[3px] text-[11px] font-medium tracking-wide text-[#93a0ad]">
              AI Genel Müdür
            </p>
          </div>
          <button
            aria-label="Ayarlar"
            aria-expanded={isSettingsOpen}
            aria-haspopup="menu"
            className="grid h-9 w-9 place-items-center rounded-full text-[#93a0ad] transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34e6cf]"
            onClick={() => setIsSettingsOpen((value) => !value)}
            type="button"
          >
            <SvgSettings />
          </button>
        </div>
      </header>
      <div className="flex shrink-0 justify-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#34e6cf] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34e6cf]" onClick={startNewConversation} type="button">
          Yeni Sohbet
        </button>
        <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#93a0ad] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34e6cf]" onClick={openHistory} type="button">
          Geçmiş
        </button>
      </div>

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
        {attachment || isAttachmentUploading ? <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#e4d8cc] bg-white px-3 py-2 text-xs font-semibold text-[#6a5040]"><SvgFile /><span className="min-w-0 flex-1 truncate">{isAttachmentUploading ? "Belge yükleniyor…" : attachment?.filename}</span>{attachment ? <button aria-label="Belgeyi kaldır" onClick={() => { void fetch(`/api/customers/document-attachments/${encodeURIComponent(attachment.attachmentRef)}`, { method: "DELETE", credentials: "include" }); setAttachment(null); }} type="button">×</button> : null}</div> : null}
        <div className="mx-auto max-w-3xl space-y-6">
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
            transientStatus ? <RuntimeStatus status={transientStatus} /> : <ThinkingBubble />
          ) : streamingContent !== null ? (
            <MetrixBubble text={streamingContent} />
          ) : null}
          {error && !isThinking ? <ErrorNote message={error} /> : null}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────── */}
      <div
        className="shrink-0 border-t border-white/[0.08] bg-[#061018]/90 px-4 pt-3 backdrop-blur-xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[24px] bg-white/[0.055] px-2 py-2 shadow-[0_18px_50px_rgba(0,0,0,.3)] ring-1 ring-white/10 focus-within:ring-[#34e6cf]/45">
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
            className="min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] font-medium leading-[1.5] text-[#f4f7f8] outline-none placeholder:text-[#5c6673] disabled:opacity-50"
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
          <div className="px-2 pt-2 text-center text-[12px] font-medium text-[#f0a090]">
            <p>{orchestrator.connectionError}</p>
            {orchestrator.playbackBlocked ? <button className="mt-2 rounded-lg border border-[#f0a090]/40 px-3 py-1.5 font-bold" onClick={() => void orchestrator.retryPlayback()} type="button">Tekrar dinle</button> : null}
          </div>
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
        <AttachmentSheet onClose={() => setIsAttachOpen(false)} onSelect={(file) => void uploadAttachment(file)} />
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
      {isSettingsOpen ? <SettingsMenu onClose={() => setIsSettingsOpen(false)} onFilm={() => { setIsSettingsOpen(false); setShowBrandFilm(true); }} /> : null}
      {showBrandFilm ? <BrandFilmPlayer manual onContinue={() => setShowBrandFilm(false)} /> : null}
      {showMicPrompt ? <PermissionDialog title="Mikrofon erişimi" description="Metrix’le sesli konuşabilmek için mikrofon erişimine izin vermeniz gerekiyor." primary="Mikrofonu Aç" onCancel={() => setShowMicPrompt(false)} onConfirm={() => void startVoice()} /> : null}
    </div>
  );
}

// ─── Message Bubbles ─────────────────────────────────────────────────────────

function MetrixBubble({ text }: { text: string }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#34e6cf]">
        Metrix
      </p>
      <p className="max-w-[68ch] whitespace-pre-line text-[16px] font-medium leading-[1.7] text-[#e3e8eb]">
        {text}
      </p>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] rounded-[18px] rounded-tr-[5px] border border-white/10 bg-white/[0.08] px-4 py-3">
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

function RuntimeStatus({ status }: { status: TransientStatus }) {
  return (
    <div aria-atomic="true" aria-live="polite" className="min-h-[52px] select-none" data-status-category={status.category} role="status">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#c8a878]">Metrix</p>
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#c8a878]">
        <span aria-hidden="true" className="h-[6px] w-[6px] animate-pulse rounded-full bg-[#c8a878]" />
        <span>{status.content}</span>
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

function AttachmentSheet({ onClose, onSelect }: { onClose: () => void; onSelect: (file: File) => void }) {
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
        <div className="grid grid-cols-3 gap-3">
          {ATTACH_OPTIONS.map(({ label, Icon, accept, capture }) => (
            <label
              className="flex flex-col items-center gap-2"
              key={label}
            >
              <input accept={accept} capture={capture} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onSelect(file); }} type="file" />
              <span className="grid h-14 w-14 place-items-center rounded-[18px] border border-[#e4d8cc] bg-white shadow-[0_3px_10px_rgba(7,18,38,0.06)]">
                <Icon />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight text-[#6a5040]">
                {label}
              </span>
            </label>
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

function PermissionDialog({ title, description, primary, onCancel, onConfirm }: { title: string; description: string; primary: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="absolute inset-0 z-[70] grid place-items-center bg-black/55 px-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="permission-title">
      <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[#0b1821] p-6 shadow-2xl">
        <h2 id="permission-title" className="text-lg font-semibold text-[#f4f7f8]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#93a0ad]">{description}</p>
        <div className="mt-6 flex justify-end gap-3"><button className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#93a0ad]" onClick={onCancel} type="button">Şimdilik Değil</button><button autoFocus className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#062421]" onClick={onConfirm} type="button">{primary}</button></div>
      </div>
    </div>
  );
}

function SettingsMenu({ onClose, onFilm }: { onClose: () => void; onFilm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  async function logout() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      const result = await response.json() as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Oturum kapatılamadı.");
      sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
      sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      window.location.replace("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Oturum kapatılamadı."); setBusy(false); }
  }
  return (
    <div className="absolute inset-0 z-[60]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} role="menu" aria-label="Ayarlar" className="absolute right-4 top-[72px] w-[min(330px,calc(100vw-32px))] rounded-[22px] border border-white/10 bg-[#0b1821]/95 p-3 shadow-2xl backdrop-blur-xl">
        <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-[.18em] text-[#6f7a87]">Ayarlar</p>
        {!confirming ? <><button role="menuitem" className="w-full rounded-xl px-3 py-3 text-left text-sm font-semibold hover:bg-white/[.06]" onClick={onFilm} type="button">Metrix Filmi</button><div className="my-2 border-t border-white/[.08]" /><button role="menuitem" className="w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-200 hover:bg-red-400/10" onClick={() => setConfirming(true)} type="button">Çıkış Yap</button></> : <div className="p-3"><p className="text-sm leading-6 text-[#e3e8eb]">Bu cihazdaki Metrix oturumunu kapatmak istiyor musunuz?</p><div className="mt-4 flex justify-end gap-2"><button className="rounded-lg px-3 py-2 text-sm text-[#93a0ad]" disabled={busy} onClick={() => setConfirming(false)} type="button">Vazgeç</button><button className="rounded-lg bg-red-400/15 px-3 py-2 text-sm font-bold text-red-200 disabled:opacity-50" disabled={busy} onClick={() => void logout()} type="button">{busy ? "Çıkış yapılıyor…" : "Çıkış Yap"}</button></div></div>}
        {error ? <p aria-live="polite" className="m-3 text-xs text-red-200">{error}</p> : null}
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
