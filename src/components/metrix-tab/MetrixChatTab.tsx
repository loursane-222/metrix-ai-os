"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { dispatchConversationNavigation, hasExecutiveNavigationHandler } from "@/lib/conversation-extensions/conversation-navigation-runtime";
import { readExecutiveNavigationCommandInput, resolveNavigationAssistantContent, type ExecutiveNavigationCompletion } from "@/lib/conversation-extensions/executive-navigation-command";
import { businessNavigationRouteType, emitBusinessNavigationTelemetry } from "@/lib/conversation-extensions/business-navigation-telemetry";

import { useExecutivePresence } from "@/components/executive-presence/ExecutivePresenceContext";
import { ExecutiveFacePresence } from "@/components/executive-presence/ExecutiveFacePresence";
import { useVoiceExperienceOrchestrator } from "./voice/useVoiceExperienceOrchestrator";
import { closeActiveWorkspaceSurface, executeActiveConversationExtension, resetActiveConversationExtensionState } from "@/lib/conversation-extensions/active-conversation-extension";
import { buildExecutiveFallbackResponse } from "@/lib/ai/identity/executive-fallback-response";
import { ConversationSubmitController } from "./conversationSubmitController";
import { getRuntimeTelemetryContext, setRuntimeTelemetryContext } from "./runtimeTelemetryContext";
import { resolveTextResponseReadiness, type TextResponseStatusCategory } from "@/lib/conversation-understanding";
import { useFirstExperience } from "./first-experience/useFirstExperience";
import { decideConversationSessionBootstrap } from "./conversationSessionBootstrap";
import { buildDailyBriefingCardRows } from "./dailyBriefingCardRows";
import { EvidenceChain, ExecutiveStroke, PendingWorkRail } from "@/components/executive-signatures/SignatureComponents";
import { atmosphereTone, useAtmosphereAssessment, type AtmosphereAssessment } from "@/components/living-workspace/AtmosphereAssessmentContext";
import { usePendingWork, type PendingWorkItem } from "@/components/executive-signatures/usePendingWork";
import { BrandFilmPlayer } from "@/components/brand-film/BrandFilmPlayer";
import { useExecutiveHeaderActions } from "@/components/living-workspace/ExecutiveHeaderActionsContext";
import { ExecutiveIcon } from "@/components/living-workspace/ExecutiveIcons";
import { useWorkspacePresentation } from "@/components/living-workspace/WorkspacePresentationContext";
import { MetrixEcosystemField } from "./MetrixEcosystemField";
import type { ApprovalLifecycleEnvelope, ExecutiveLifecycleEnvelope } from "@/lib/executive-lifecycle";
import { DOMAIN_SURFACE_ADAPTERS, useActiveWorkspaceContext, type WorkspaceDomain } from "@/lib/living-workspace";
import { silentPreparationRuntime } from "@/lib/executive-signatures/silent-preparation-runtime";
import type { ExecutiveDailyBriefingV2 } from "@/lib/executive-daily-briefing-v2";
import { ATTACHMENT_SESSION_CHANGED_EVENT, bindActiveAttachmentConversation, clearBrowserAttachmentSession, getActiveAttachment, readBrowserAttachmentSession, setActiveAttachment, type AttachmentReference } from "@/lib/conversation-attachments/attachment-session";
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

type Message = {
  role: "metrix" | "user";
  content: string;
  dailyBriefing?: ExecutiveDailyBriefingV2;
};
type TransientStatus = { turnId: string; category: TextResponseStatusCategory; content: string };
type ExecutivePauseState = { turnId: string; band: "management" | "strategic" };
type AttachmentPreviewSummary = {
  lifecycle: string;
  candidates: Array<{ fieldId: string; normalizedValue?: unknown; confidence: number }>;
};

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

// Same 9 domains the "excel'den X aktar" voice/text commands already open —
// this is just a second, visible entry point onto the identical import
// wizards, so it goes through the same dispatchConversationNavigation path
// those commands use rather than reaching into the workspace runtime
// directly (see conversation-boundary-reset-contract.test.ts).
const IMPORT_DOMAIN_OPTIONS: Array<{ label: string; route: string; authorityKey: string }> = [
  { label: "Müşteri", route: "/metrix/customers/import", authorityKey: "customers.import.page" },
  { label: "Ürün", route: "/metrix/products/import", authorityKey: "products.import.page" },
  { label: "Fatura", route: "/metrix/invoices/import", authorityKey: "invoices.import.page" },
  { label: "Tedarikçi", route: "/metrix/suppliers/import", authorityKey: "suppliers.import.page" },
  { label: "Tahsilat", route: "/metrix/collections/import", authorityKey: "payments.import.page" },
  { label: "Teklif", route: "/metrix/offers/import", authorityKey: "offers.import.page" },
  { label: "Sipariş", route: "/metrix/orders/import", authorityKey: "orders.import.page" },
  { label: "Stok", route: "/metrix/stock/import", authorityKey: "stock.import.page" },
  { label: "Üretim", route: "/metrix/production/import", authorityKey: "production.import.page" },
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
  const activeWorkspaceContext = useActiveWorkspaceContext();
  const workspacePresented = useWorkspacePresentation();
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
  const [executivePause, setExecutivePause] = useState<ExecutivePauseState | null>(null);
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
  const typingIntervalRef = useRef<number | null>(null);
  const streamingContentRef = useRef<string>("");
  const activeVoiceTurnIdRef = useRef<string | null>(null);
  const pendingVoiceCanonicalRef = useRef<{ turnId: string; content: string } | null>(null);
  // The /api/ai/chat request currently being read by send()'s stream loop.
  // Aborted on voice barge-in (via onInterrupt below) so a cut-off response
  // stops producing chunks instead of continuing to generate in the
  // background after playback has already stopped.
  const activeRequestRef = useRef<AbortController | null>(null);
  const submitControllerRef = useRef(new ConversationSubmitController());
  const orchestrator = useVoiceExperienceOrchestrator(
    (text) => {
      void send(text, true);
    },
    (revealedTextAtInterrupt) => {
      activeRequestRef.current?.abort();
      submitControllerRef.current.cancel();
      setIsThinking(false);
      pendingVoiceCanonicalRef.current = null;
      activeVoiceTurnIdRef.current = null;
      const heard = revealedTextAtInterrupt.trim();
      const durableText = streamingContentRef.current.trim() || heard;
      if (durableText) {
        setMessages((prev) => [...prev, { role: "metrix", content: durableText }]);
        setStreamingContent(null);
        streamingContentRef.current = "";
        startNewAssistantMessage();
      }
    },
    undefined,
    () => {
      const pending = pendingVoiceCanonicalRef.current;
      pendingVoiceCanonicalRef.current = null;
      if (!pending || pending.turnId !== activeVoiceTurnIdRef.current) return;
      activeVoiceTurnIdRef.current = null;
      if (!pending.content.trim()) return;
      setMessages((prev) => [...prev, { role: "metrix", content: pending.content }]);
    },
  );
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [isImportPickerOpen, setIsImportPickerOpen] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentReference | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewSummary | null>(null);
  const [isAttachmentUploading, setIsAttachmentUploading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ConversationSummary[] | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [approvalDecisionPending, setApprovalDecisionPending] = useState<string | null>(null);
  const [approvalDecisionError, setApprovalDecisionError] = useState<string | null>(null);
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showBrandFilm, setShowBrandFilm] = useState(false);
  const { assessment, setAssessment } = useAtmosphereAssessment();
  const { approvals: pendingApprovals, refresh: refreshPendingWork } = usePendingWork(conversationId);

  useEffect(() => {
    const syncAttachmentPreview = () => {
      const preview = readBrowserAttachmentSession().preview;
      const next = preview && typeof preview === "object" ? preview as AttachmentPreviewSummary : null;
      setAttachmentPreview((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    syncAttachmentPreview();
    window.addEventListener(ATTACHMENT_SESSION_CHANGED_EVENT, syncAttachmentPreview);
    const interval = window.setInterval(syncAttachmentPreview, 250);
    return () => {
      window.removeEventListener(ATTACHMENT_SESSION_CHANGED_EVENT, syncAttachmentPreview);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const onUnavailable = (event: Event) => {
      const route = (event as CustomEvent<{ route?: string }>).detail?.route;
      setError(`${buildExecutiveFallbackResponse("unsupported_capability")} Bu konu için sohbet içinde çalışma alanı henüz hazır değil.${route ? ` (${route})` : ""}`);
    };
    window.addEventListener("metrix:workspace-unavailable", onUnavailable);
    return () => window.removeEventListener("metrix:workspace-unavailable", onUnavailable);
  }, []);

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
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setApprovalDecisionError(buildExecutiveFallbackResponse("connection_lost"));
      });
    void fetch("/api/executive/lifecycle", { credentials: "include", signal: controller.signal })
      .then((response) => response.json())
      .then((json: { ok: true; data: { envelopes: ExecutiveLifecycleEnvelope[] } } | { ok: false }) => {
        if (!json.ok) return;
        for (const envelope of json.data.envelopes) publishLifecycleEnvelope(envelope);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setApprovalDecisionError(buildExecutiveFallbackResponse("connection_lost"));
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

  async function uploadAttachment(file: File) { setIsAttachOpen(false); setIsAttachmentUploading(true); setError(null); const form = new FormData(); form.set("file", file); if (conversationId) form.set("conversationId", conversationId); try { const response = await fetch("/api/customers/document-attachments", { method: "POST", credentials: "include", body: form }); const json = await response.json() as ApiResponse<AttachmentReference>; if (!json.ok) { setError(json.error.message); return; } setAttachment(json.data); setActiveAttachment(json.data); } catch { setError(buildExecutiveFallbackResponse("connection_lost")); } finally { setIsAttachmentUploading(false); } }

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
      pendingBufferRef.current = "";
      streamingContentRef.current = "";
      pendingVoiceCanonicalRef.current = null;
      activeVoiceTurnIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const generation = activeTextGenerationRef.current;
    if (streamingContent === null || generation === null) return;
    // Voice reveal owns the viewport once TTS starts speaking — letting this
    // effect also claim viewport generation here makes the two race for
    // ownership every animation frame, snapping auto-follow back to "true"
    // (and the scroll to bottom) even after the user has scrolled up.
    if (orchestrator.presence.kind === "speaking") return;
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
    streamingContentRef.current = "";
    pendingVoiceCanonicalRef.current = null;
    activeVoiceTurnIdRef.current = null;
    setTransientStatus(null);
    finishActiveTextMessage();
    pendingBufferRef.current = "";
    stopTypingInterval();
    resetActiveConversationExtensionState();
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
    resetActiveConversationExtensionState();
    setStreamingContent(null);
    streamingContentRef.current = "";
    pendingVoiceCanonicalRef.current = null;
    activeVoiceTurnIdRef.current = null;
    setTransientStatus(null);
    setIsThinking(false);
    setError(null);
    pendingBufferRef.current = "";
    finishActiveTextMessage();
  }

  function startTypingInterval() {
    if (typingIntervalRef.current !== null) return;
    typingIntervalRef.current = requestAnimationFrame(() => {
      typingIntervalRef.current = null;
      if (!pendingBufferRef.current) return;
      streamingContentRef.current += pendingBufferRef.current;
      pendingBufferRef.current = "";
      setStreamingContent(streamingContentRef.current);
    });
  }

  function stopTypingInterval() {
    if (typingIntervalRef.current !== null) {
      cancelAnimationFrame(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }

  async function send(overrideText?: string, isVoice = false) {
    const text = (overrideText ?? draft).trim();
    silentPreparationRuntime.cancel();
    const claimedTurn = submitControllerRef.current.claim(text, isVoice ? "voice" : "written");
    if (!claimedTurn) return;
    const turn = claimedTurn;
    pendingVoiceCanonicalRef.current = null;
    activeVoiceTurnIdRef.current = isVoice ? turn.turnId : null;
    if (!isVoice) {
      performance.mark("text_submit_started");
      console.info("[text-stream][latency]", { label: "text_submit_started", turnId: turn.turnId });
    }

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setDraft("");
    setIsThinking(true);
    setError(null);
    setStreamingContent(null);
    streamingContentRef.current = "";
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
    const existingTrace = isVoice ? getRuntimeTelemetryContext() : null;
    const turnCorrelationId = existingTrace?.correlationId ?? turn.turnId;

    let extensionResult;
    try {
      extensionResult = await executeActiveConversationExtension({
        utterance: text,
        source: isVoice ? "voice" : "written",
        turnKey: turn.turnId,
        correlationId: turnCorrelationId,
        activeWorkspaceContext,
      });
    } catch {
      if (submitControllerRef.current.isCurrent(turn)) setError(buildExecutiveFallbackResponse("connection_lost"));
      finishSubmit("error", "Conversation extension failed");
      return;
    }
    if (!submitControllerRef.current.isCurrent(turn)) return;
    if (extensionResult.duplicate) { finishSubmit("abort"); return; }
    const browserPreview = readBrowserAttachmentSession().preview;
    setAttachmentPreview(
      browserPreview && typeof browserPreview === "object"
        ? browserPreview as AttachmentPreviewSummary
        : null,
    );

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
    body.activeWorkspaceContext = activeWorkspaceContext;
    if (conversationId) body.conversationId = conversationId;
    if (isVoice) body.channel = "voice";
    if (extensionResult.handoff) body.conversationExtensionHandoff = extensionResult.handoff;
    setRuntimeTelemetryContext({
      correlationId: turnCorrelationId,
      turnId: turn.turnId,
      channel: isVoice ? "voice" : "text",
    });

    try {
      if (isVoice) orchestrator.logLatencyMark("chat_fetch_started");
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-Id": turnCorrelationId,
          "X-Turn-Id": turn.turnId,
          "X-Metrix-Channel": isVoice ? "voice" : "text",
        },
        body: JSON.stringify(body),
        signal: requestController.signal,
      });
      if (!isVoice) {
        performance.mark("text_response_headers_received");
        console.info("[text-stream][latency]", { label: "text_response_headers_received", requestId: response.headers.get("X-Request-Id") });
      }
      if (isVoice) orchestrator.logLatencyMark("chat_response_headers_received");

      // Capture conversationId as soon as headers arrive, not only from the
      // "done" event body. conversation.id is already known server-side
      // before a single chunk streams (see the X-Conversation-Id header in
      // route.ts) — if this turn is later barge-in-aborted before "done"
      // ever fires, conversationId React
      // state would otherwise stay null, and the NEXT turn would silently
      // create a brand-new conversation instead of continuing this one
      // (FAZ 7 root cause).
      const headerConversationId = response.headers.get("X-Conversation-Id");
      if (headerConversationId) {
        setConversationId(headerConversationId);
        sessionStorage.setItem(CONVERSATION_STORAGE_KEY, headerConversationId);
      }

      if (!response.ok || !response.body) {
        setError(buildExecutiveFallbackResponse("connection_lost"));
        finishSubmit("error", "Conversation request failed");
        if (isVoice) orchestrator.onStreamError();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminalEventSeen = false;
      let firstNetworkChunk = true;
      let firstEvent = true;
      const requestId = response.headers.get("X-Request-Id");
      let navigationCompletionPromise: Promise<ExecutiveNavigationCompletion> | null = null;
      let navigationCompletion: ExecutiveNavigationCompletion | null = null;
      let navigationCorrelationId: string | null = null;

      async function processStreamLine(line: string) {
        if (!line.trim()) return;
        if (!submitControllerRef.current.isCurrent(turn)) return;
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (firstEvent) {
            firstEvent = false;
            performance.mark("text_first_event_parsed");
            console.info("[text-stream][latency]", { label: "text_first_event_parsed", requestId });
          }
          if (event.type === "signature") {
            const signal = event.signal as { signature?: string; band?: string; delayMs?: number; domain?: string; confidence?: { level?: string } } | undefined;
            if (signal?.signature === "executive.pause" && (signal.band === "management" || signal.band === "strategic")) {
              const delayMs = Math.max(0, Math.min(1100, Number(signal.delayMs) || 0));
              setExecutivePause({ turnId: turn.turnId, band: signal.band });
              await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
              setExecutivePause((current) => current?.turnId === turn.turnId ? null : current);
            } else if (signal?.signature === "sessiz.hazirlik" && signal.confidence?.level === "high" && signal.domain && signal.domain !== "calendar" && signal.domain in DOMAIN_SURFACE_ADAPTERS) {
              // Calendar is excluded here on purpose: its canonical endpoint
              // requires rangeStart/rangeEnd query params (unlike every other
              // domain's flat list endpoint), so this generic bare-endpoint
              // prefetch always 400s for it — and CalendarWorkspace never
              // reads from silentPreparationRuntime's cache anyway, so the
              // prefetch has no consumer even when it succeeds.
              const domain = signal.domain as WorkspaceDomain;
              silentPreparationRuntime.prepare(domain, DOMAIN_SURFACE_ADAPTERS[domain].endpoint);
            }
          } else if (event.type === "workspace-control" && event.action === "close") {
            closeActiveWorkspaceSurface();
          } else if (event.type === "chunk") {
            const content = String(event.content ?? "");
            if (navigationCompletionPromise && !navigationCompletion) navigationCompletion = await navigationCompletionPromise;
            if (navigationCompletion && navigationCompletion.status !== "COMPLETED") return;
            if (isVoice) {
              orchestrator.onChunk(content);
            }
            if (content && activeTextGenerationRef.current === null) {
              setTransientStatus((current) => current?.turnId === turn.turnId ? null : current);
              activeTextGenerationRef.current = startNewAssistantMessage();
              streamingContentRef.current = content;
              setStreamingContent(content);
              performance.mark("text_first_content_render_scheduled");
              console.info("[text-stream][latency]", { label: "text_first_content_render_scheduled", requestId });
              requestAnimationFrame(() => {
                performance.mark("text_first_content_painted");
                console.info("[text-stream][latency]", { label: "text_first_content_painted", requestId });
              });
            } else {
              pendingBufferRef.current += content;
              startTypingInterval();
            }
          } else if (event.type === "navigation") {
            const command = readExecutiveNavigationCommandInput(event.command);
            const eventCorrelationId = command?.correlationId ?? turnCorrelationId;
            navigationCorrelationId = eventCorrelationId;
            emitBusinessNavigationTelemetry("BusinessNavigationClient", {
              event: "stream_event_received", correlationId: eventCorrelationId,
              eventType: "navigation", routeType: command ? businessNavigationRouteType(command.route) : null,
              commandValid: command !== null, dispatchAttempted: command !== null,
            });
            if (!command) {
              navigationCompletion = Object.freeze({ status: "FAILED", changedExecutiveTargetIds: Object.freeze([]) });
              navigationCompletionPromise = Promise.resolve(navigationCompletion);
              emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "stream_event_rejected", correlationId: eventCorrelationId, failureCode: "INVALID_COMMAND" });
            } else {
              emitBusinessNavigationTelemetry("BusinessNavigationClient", {
                event: "dispatch_started", correlationId: command.correlationId,
                routeType: businessNavigationRouteType(command.route), source: command.source,
                hostAvailable: hasExecutiveNavigationHandler(), completionStatus: "PENDING", failureCode: null,
              });
              navigationCompletionPromise = dispatchConversationNavigation(command).then((completion) => {
                navigationCompletion = completion;
                emitBusinessNavigationTelemetry("BusinessNavigationClient", {
                  event: "dispatch_completed", correlationId: command.correlationId,
                  routeType: businessNavigationRouteType(command.route), source: command.source,
                  hostAvailable: hasExecutiveNavigationHandler(), completionStatus: completion.status,
                  failureCode: completion.status === "COMPLETED" ? null : `NAVIGATION_${completion.status}`,
                });
                return completion;
              });
            }
          } else if (event.type === "done") {
            finishSubmit("completed");
            setExecutivePause((current) => current?.turnId === turn.turnId ? null : current);
            if (navigationCompletionPromise && !navigationCompletion) navigationCompletion = await navigationCompletionPromise;
            setTransientStatus((current) => current?.turnId === turn.turnId ? null : current);
            terminalEventSeen = true;
            performance.mark("text_done_received");
            console.info("[text-stream][latency]", { label: "text_done_received", requestId });
            stopTypingInterval();
            streamingContentRef.current += pendingBufferRef.current;
            pendingBufferRef.current = "";
            const ai = (event.ai ?? {}) as { content?: string };
            const nextAssessment = (ai as { executiveAssessment?: AtmosphereAssessment }).executiveAssessment;
            if (nextAssessment?.assessmentId && nextAssessment.assessmentId !== assessment?.assessmentId) setAssessment(nextAssessment);
            const nextConversationId = String(event.conversationId ?? "");
            setConversationId(nextConversationId);
            if (nextConversationId) {
              sessionStorage.setItem(CONVERSATION_STORAGE_KEY, nextConversationId);
            }
            const streamed = streamingContentRef.current;
            const finalContent = resolveNavigationAssistantContent(ai.content || streamed, navigationCompletion);
            if (navigationCompletion) {
              emitBusinessNavigationTelemetry("BusinessNavigationClient", {
                event: navigationCompletion.status === "COMPLETED" ? "assistant_success_emitted" : "assistant_navigation_failure_emitted",
                correlationId: navigationCorrelationId ?? turnCorrelationId,
                completionStatus: navigationCompletion.status,
                failureCode: navigationCompletion.status === "COMPLETED" ? null : `NAVIGATION_${navigationCompletion.status}`,
              });
            }
            if (isVoice) {
              pendingVoiceCanonicalRef.current = finalContent.trim()
                ? { turnId: turn.turnId, content: finalContent }
                : null;
              orchestrator.onStreamDone();
            } else if (finalContent.trim()) {
              setMessages((prev) => [...prev, { role: "metrix", content: finalContent }]);
            }
            setStreamingContent(null);
            streamingContentRef.current = "";
            const generation = activeTextGenerationRef.current;
            if (generation !== null) finishActiveTextMessage();
            else startNewAssistantMessage();
            // event.message is already governed server-side (route.ts routes
            // every mid-stream failure through buildExecutiveFallbackResponse
            // before it ever reaches the SSE payload) — but this client never
            // trusts that and renders it directly regardless. The
            // user-visible text below always comes from this same canonical
            // fallback authority, never from the event's own field.
          } else if (event.type === "error") {
            finishSubmit("error", "Conversation stream failed");
            setExecutivePause((current) => current?.turnId === turn.turnId ? null : current);
            setTransientStatus((current) => current?.turnId === turn.turnId ? null : current);
            terminalEventSeen = true;
            stopTypingInterval();
            pendingBufferRef.current = "";
            pendingVoiceCanonicalRef.current = null;
            activeVoiceTurnIdRef.current = null;
            setError(buildExecutiveFallbackResponse("connection_lost"));
            setStreamingContent(null);
            finishActiveTextMessage();
            if (isVoice) orchestrator.onStreamError();
          }
        } catch {
          emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "stream_event_rejected", correlationId: turnCorrelationId, failureCode: "NDJSON_PARSE_FAILED" });
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (firstNetworkChunk) {
          firstNetworkChunk = false;
          performance.mark("text_first_network_chunk_received");
          console.info("[text-stream][latency]", { label: "text_first_network_chunk_received", requestId });
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          await processStreamLine(line);
        }
      }

      if (buffer.trim()) {
        await processStreamLine(buffer);
      }
      if (!terminalEventSeen && submitControllerRef.current.isCurrent(turn)) {
        stopTypingInterval();
        pendingBufferRef.current = "";
        pendingVoiceCanonicalRef.current = null;
        activeVoiceTurnIdRef.current = null;
        setStreamingContent(null);
        finishActiveTextMessage();
        setError(buildExecutiveFallbackResponse("connection_lost"));
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
      pendingVoiceCanonicalRef.current = null;
      activeVoiceTurnIdRef.current = null;
      setStreamingContent(null);
      setTransientStatus((current) => current?.turnId === turn.turnId ? null : current);
      finishActiveTextMessage();
      // Abort is the expected outcome of a voice barge-in, not a failure —
      // interrupt() already moved presence/turn state to reflect it, so
      // surfacing an error or calling onStreamError here would fight that.
      if (!isAbort) {
        setError(buildExecutiveFallbackResponse("connection_lost"));
        if (isVoice) orchestrator.onStreamError();
      }
    }

    if (activeRequestRef.current !== requestController) return;
    finishSubmit("completed");
  }

  async function handleMicClick() {
    if (micPermission === "requesting") return;

    if (orchestrator.isConnected) {
      pendingVoiceCanonicalRef.current = null;
      activeVoiceTurnIdRef.current = null;
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
    pendingVoiceCanonicalRef.current = null;
    activeVoiceTurnIdRef.current = null;
    setStreamingContent(null);
    setTransientStatus(null);
    setError(null);
  }

  async function decideApprovalFromPanel(approvalId: string, decision: "approve" | "reject", pending?: PendingWorkItem) {
    if (approvalDecisionPending) return;
    setApprovalDecisionPending(approvalId);
    setApprovalDecisionError(null);
    try {
      const paymentId = pending?.envelope.target?.entityId;
      const isPaymentApply = decision === "approve"
        && pending?.envelope.approval.actionName === "payment.apply"
        && paymentId
        && pending.paymentAmount !== undefined;
      const response = isPaymentApply
        ? await fetch(`/api/payments/${encodeURIComponent(paymentId)}/actions/apply`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "X-Correlation-Id": crypto.randomUUID() },
          body: JSON.stringify({ operation: "confirm", approvalId, amount: pending.paymentAmount }),
        })
        : await fetch(`/api/executive/approvals/${encodeURIComponent(approvalId)}/decision`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        });
      const json = await response.json() as
        | { ok: true; data: { envelope: ApprovalLifecycleEnvelope } }
        | { ok: false; error: { message: string } };
      // A structured API error is our own curated, already-authored message
      // (never a raw exception) — safe to show directly. Anything else
      // (network failure, JSON parse failure, unexpected throw) falls
      // through to the catch block below and never surfaces its own raw
      // text; it renders through the same governed fallback authority as
      // the rest of this component's conversation surface.
      if (!json.ok) { setApprovalDecisionError(buildExecutiveFallbackResponse("connection_lost")); return; }
      if (!isPaymentApply) publishLifecycleEnvelope(json.data.envelope);
      await refreshPendingWork();
    } catch {
      setApprovalDecisionError(buildExecutiveFallbackResponse("connection_lost"));
    } finally {
      setApprovalDecisionPending(null);
    }
  }

  const isVoiceListening =
    orchestrator.presence.kind === "listening" || orchestrator.presence.kind === "userSpeaking";
  const isVoiceResponding =
    orchestrator.presence.kind === "thinking" || orchestrator.presence.kind === "speaking";
  const isEmptyConversation =
    messages.length === 1 && !isThinking && !isVoiceResponding && streamingContent === null;

  useExecutiveHeaderActions({
    openHistory,
    toggleSettings: () => setIsSettingsOpen((value) => !value),
  });

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
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.055] p-2 focus-within:border-[#C9BFA8]/50">
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
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${isVoiceListening ? "bg-[#C9BFA8] text-[#14120F]" : "bg-white/10 text-white"}`}
              disabled={micPermission === "requesting"}
              onClick={() => void handleMicClick()}
              type="button"
            >
              <SvgMic />
            </button>
            <button
              aria-label="Komutu gönder"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#C9BFA8] text-[#14120F] disabled:opacity-40"
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
                      item.status === "active" ? "animate-pulse bg-[#C9BFA8] motion-reduce:animate-none"
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
                        <PendingWorkRail work={{ title: item.label, nextStep: "Onay veya ret kararı gerekiyor", onPrimary: () => { const lifecycle = item.lifecycle; const pending = lifecycle?.source === "approval" ? pendingApprovals.find((candidate) => candidate.envelope.approval.approvalId === lifecycle.approval.approvalId) : undefined; if (lifecycle?.source === "approval") void decideApprovalFromPanel(lifecycle.approval.approvalId, "approve", pending); }, onCancel: () => { const lifecycle = item.lifecycle; const pending = lifecycle?.source === "approval" ? pendingApprovals.find((candidate) => candidate.envelope.approval.approvalId === lifecycle.approval.approvalId) : undefined; if (lifecycle?.source === "approval") void decideApprovalFromPanel(lifecycle.approval.approvalId, "reject", pending); }, primaryContent: <ExecutiveStroke label="Kararı kesinleştir" onCommit={() => { const lifecycle = item.lifecycle; const pending = lifecycle?.source === "approval" ? pendingApprovals.find((candidate) => candidate.envelope.approval.approvalId === lifecycle.approval.approvalId) : undefined; if (lifecycle?.source === "approval") void decideApprovalFromPanel(lifecycle.approval.approvalId, "approve", pending); }} /> }} />
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

  const workspaceComposer = (
    <div className="metrix-main-composer shrink-0 px-4 pt-3" data-conversation-composer>
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[24px] bg-white/[0.055] px-2 py-2 shadow-[0_18px_50px_rgba(0,0,0,.3)] ring-1 ring-white/10 focus-within:ring-[#34e6cf]/45">
        <button aria-label="Dosya ekle" className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[.14] text-[#9aa7b0] transition hover:border-white/[.24] hover:bg-white/[.05] hover:text-[#c9d1d6] active:bg-white/[.08]" disabled={isThinking} onClick={() => setIsAttachOpen(true)} type="button"><SvgPlus /></button>
        <textarea className="min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] font-medium leading-[1.5] text-[#f4f7f8] outline-none placeholder:text-[#5c6673] disabled:opacity-50" disabled={isThinking} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={isThinking || (orchestrator.isConnected && isVoiceResponding) ? "Metrix yanıtlıyor..." : orchestrator.isConnected && isVoiceListening ? "Dinleniyor..." : "Metrix ile konuş..."} ref={textareaRef} rows={1} value={draft}/>
        {draft.trim() && !isThinking ? <button aria-label="Gönder" className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#C9BFA8] text-[#14120F] transition hover:bg-[#DDD4BE] active:bg-[#C9BFA8]" onClick={() => void send()} type="button"><SvgArrowUp /></button> : <button aria-label={micPermission === "requesting" ? "Toplantıya bağlanıyor" : orchestrator.isConnected && isVoiceListening ? "Dinleniyor — durdurmak için dokun" : orchestrator.isConnected && isVoiceResponding ? "Metrix yanıtlıyor — durdurmak için dokun" : "Toplantıya başla"} className={`mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${micPermission === "requesting" ? "animate-pulse bg-[#1c6e73] text-white" : orchestrator.isConnected && isVoiceListening ? "bg-[#1C1914] text-[#EDE7D9] ring-2 ring-[#C9BFA8] ring-offset-1 ring-offset-[#14120F]" : "bg-[#1C1914] text-[#EDE7D9] hover:bg-[#1C1914] active:bg-[#0a151c]"}`} disabled={isThinking || micPermission === "requesting"} onClick={() => void handleMicClick()} type="button"><SvgMic /></button>}
      </div>
      {micPermission === "requesting" ? <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#EDE7D9]">Toplantıya bağlanıyor...</p> : orchestrator.connectionError ? <div className="px-2 pt-2 text-center text-[12px] font-medium text-[#f0a090]"><p>{orchestrator.connectionError}</p>{orchestrator.playbackBlocked ? <button className="mt-2 rounded-lg border border-[#f0a090]/40 px-3 py-1.5 font-bold" onClick={() => void orchestrator.retryPlayback()} type="button">Tekrar dinle</button> : null}</div> : orchestrator.isConnected && isVoiceListening ? <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#8a5a2b]">Dinleniyor — konuşabilirsiniz</p> : micPermission === "denied" ? <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#b8a898]">Toplantı başlatılamadı. Lütfen tekrar dene.</p> : null}
    </div>
  );
  const conversationOverlays = <>
    {isAttachOpen ? <AttachmentSheet onClose={() => setIsAttachOpen(false)} onImportClick={() => { setIsAttachOpen(false); setIsImportPickerOpen(true); }} onSelect={(file) => void uploadAttachment(file)} /> : null}
    {isImportPickerOpen ? <ImportDomainSheet onClose={() => setIsImportPickerOpen(false)} onSelect={(route, authorityKey) => { void dispatchConversationNavigation({ route, source: "written", correlationId: crypto.randomUUID(), expectedSurfaceAuthorityKey: authorityKey }); setIsImportPickerOpen(false); }} /> : null}
    {isHistoryOpen ? <HistorySheet activeConversationId={conversationId} isLoading={isHistoryLoading} items={historyItems} onClose={() => setIsHistoryOpen(false)} onNew={() => { setIsHistoryOpen(false); startNewConversation(); }} onSelect={(id) => void selectHistoryItem(id)} /> : null}
    {isSettingsOpen ? <SettingsMenu onClose={() => setIsSettingsOpen(false)} onFilm={() => { setIsSettingsOpen(false); setShowBrandFilm(true); }} /> : null}
    {showBrandFilm ? <BrandFilmPlayer manual onContinue={() => setShowBrandFilm(false)} /> : null}
    {showMicPrompt ? <PermissionDialog title="Mikrofon erişimi" description="Metrix’le sesli konuşabilmek için mikrofon erişimine izin vermeniz gerekiyor." primary="Mikrofonu Aç" onCancel={() => setShowMicPrompt(false)} onConfirm={() => void startVoice()} /> : null}
  </>;

  if (workspacePresented) {
    const latestUser = [...messages].reverse().find((message) => message.role === "user")?.content;
    const latestMetrix = orchestrator.presence.kind === "speaking" ? orchestrator.revealedText : streamingContent ?? [...messages].reverse().find((message) => message.role === "metrix")?.content;
    return <div className={`metrix-workspace-conversation relative flex h-full flex-col bg-transparent px-3 py-2.5 sm:px-5 metrix-atmosphere metrix-atmosphere-${atmosphereTone(assessment)}`} data-conversation-context="workspace">
      <MetrixEcosystemField activeDomain={activeWorkspaceContext?.domain} />
      <div className="mx-auto grid min-h-0 w-full max-w-5xl flex-1 content-center gap-1.5" data-conversation-main>{latestUser ? <p className="line-clamp-1 text-xs font-semibold text-[#dce3e6]"><span className="mr-2 text-[10px] uppercase tracking-[.12em] text-[#64727c]">Siz</span>{latestUser}</p> : null}<p className="line-clamp-2 text-xs leading-5 text-[#9eabb3]"><span className="mr-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#C9BFA8]">METRIX</span><span>{latestMetrix || (isThinking ? "Değerlendiriyor…" : GREETING.content)}</span></p></div>
      {workspaceComposer}
      {pendingApprovals.length ? <div className="mx-auto w-full max-w-3xl px-3 pb-2">{pendingApprovals.map((approval) => <PendingWorkRail key={approval.envelope.approval.approvalId} work={{ title: approval.envelope.summary, nextStep: "Onay veya ret kararı gerekiyor", onPrimary: () => void decideApprovalFromPanel(approval.envelope.approval.approvalId, "approve", approval), onCancel: () => void decideApprovalFromPanel(approval.envelope.approval.approvalId, "reject", approval), primaryContent: <ExecutiveStroke label="Kararı kesinleştir" onCommit={() => void decideApprovalFromPanel(approval.envelope.approval.approvalId, "approve", approval)} /> }} />)}</div> : null}
      {conversationOverlays}
    </div>;
  }

  return (
    <div className={`metrix-main-experience relative flex h-full flex-col text-[#f4f7f8] [color-scheme:dark] metrix-atmosphere metrix-atmosphere-${atmosphereTone(assessment)}`}>
      <MetrixEcosystemField activeDomain={activeWorkspaceContext?.domain} />
      {/* ── Messages ───────────────────────────────────────────────────── */}
      <div
        className="metrix-main-conversation min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-7"
        data-conversation-main
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
        {attachmentPreview?.candidates?.length ? (
          <div className="mb-2 rounded-xl border border-[#c9bfa8]/35 bg-[#181714] px-3 py-3 text-[#ede7d9]">
            <p className="text-xs font-bold">Belge önizlemesi</p>
            <p className="mt-1 text-[11px] text-[#a9a193]">Kaydetmeden önce çıkarılan alanları inceleyin.</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {attachmentPreview.candidates.slice(0, 8).map((candidate) => (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2" key={candidate.fieldId}>
                  <p className="text-[10px] text-[#8f887d]">{candidate.fieldId.replace(/^customer\./, "")}</p>
                  <p className="truncate text-xs font-semibold">{String(candidate.normalizedValue ?? "")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {attachment || isAttachmentUploading ? <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#e4d8cc] bg-white px-3 py-2 text-xs font-semibold text-[#6a5040]"><SvgFile /><span className="min-w-0 flex-1 truncate">{isAttachmentUploading ? "Belge yükleniyor…" : attachment?.filename}</span>{attachment ? <button aria-label="Belgeyi kaldır" onClick={() => { void fetch(`/api/customers/document-attachments/${encodeURIComponent(attachment.attachmentRef)}`, { method: "DELETE", credentials: "include" }); setAttachment(null); setAttachmentPreview(null); }} type="button">×</button> : null}</div> : null}
        <div className={`mx-auto w-full max-w-3xl ${isEmptyConversation ? "space-y-9" : "space-y-2.5"}`}>
          <ExecutiveFacePresence behaviorStatus={behaviorSnapshot.status} voicePresence={orchestrator.presence.kind} />
          {pendingApprovals.length ? <div className="grid gap-2">{pendingApprovals.map((approval) => <PendingWorkRail key={approval.envelope.approval.approvalId} work={{ title: approval.envelope.summary, nextStep: "Onay veya ret kararı gerekiyor", onPrimary: () => void decideApprovalFromPanel(approval.envelope.approval.approvalId, "approve", approval), onCancel: () => void decideApprovalFromPanel(approval.envelope.approval.approvalId, "reject", approval), primaryContent: <ExecutiveStroke label="Kararı kesinleştir" onCommit={() => void decideApprovalFromPanel(approval.envelope.approval.approvalId, "approve", approval)} /> }} />)}</div> : null}
          {messages.map((msg, i) =>
            msg.role === "metrix" ? (
              msg.dailyBriefing ? (
                <DailyBriefingCard briefing={msg.dailyBriefing} assessment={assessment} key={i} />
              ) : (
                <MetrixBubble key={i} text={msg.content} />
              )
            ) : (
              <UserBubble key={i} text={msg.content} />
            ),
          )}
          {orchestrator.presence.kind === "thinking" ? (
            <ThinkingBubble />
          ) : orchestrator.presence.kind === "speaking" ? (
            <MetrixBubble text={orchestrator.revealedText} />
          ) : isThinking && streamingContent === null ? (
            executivePause ? <ExecutivePauseTrace band={executivePause.band} /> : transientStatus ? <RuntimeStatus status={transientStatus} /> : <ThinkingBubble />
          ) : streamingContent !== null ? (
            <MetrixBubble text={streamingContent} />
          ) : null}
          {error && !isThinking ? <ErrorNote message={error} /> : null}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────── */}
      <div
        className="metrix-main-composer shrink-0 px-4 pt-3"
        data-conversation-composer
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[24px] bg-white/[0.055] px-2 py-2 shadow-[0_18px_50px_rgba(0,0,0,.3)] ring-1 ring-white/10 focus-within:ring-[#34e6cf]/45">
          <button
            aria-label="Dosya ekle"
            className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[.14] text-[#9aa7b0] transition hover:border-white/[.24] hover:bg-white/[.05] hover:text-[#c9d1d6] active:bg-white/[.08]"
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
              className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#C9BFA8] text-[#14120F] transition hover:bg-[#DDD4BE] active:bg-[#C9BFA8]"
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
                  ? "animate-pulse bg-[#1c6e73] text-white"
                  : orchestrator.isConnected && isVoiceListening
                    ? "bg-[#1C1914] text-[#EDE7D9] ring-2 ring-[#C9BFA8] ring-offset-1 ring-offset-[#14120F]"
                    : "bg-[#1C1914] text-[#EDE7D9] hover:bg-[#1C1914] active:bg-[#0a151c]"
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
          <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#EDE7D9]">
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
      {conversationOverlays}
    </div>
  );
}

function ExecutivePauseTrace({ band }: { band: "management" | "strategic" }) {
  return <div aria-label="METRIX yanıtı değerlendiriyor" className="px-1 py-2 motion-reduce:transition-none" data-executive-signature="executive.pause" data-pause-band={band} role="status"><span className="inline-block h-px w-10 bg-[#C9BFA8]/45 shadow-[0_0_12px_rgba(201,191,168,.22)]" /></div>;
}

// ─── Message Bubbles ─────────────────────────────────────────────────────────

function DailyBriefingCard({ briefing, assessment }: { briefing: ExecutiveDailyBriefingV2; assessment: AtmosphereAssessment | null }) {
  const { rows, hiddenCount } = buildDailyBriefingCardRows(briefing);
  const summarySections = [
    ["Tahmin", briefing.forecastSummary],
    ["Skor kartı", briefing.scorecardSummary],
    ["Farkındalık", briefing.awarenessSummary],
    ["Yönetici anlatımı", briefing.executiveNarrativeSummary],
    ["Yönetim odağı", briefing.executiveFocusSummary],
    ["Sinyal eğilimi", briefing.signalTrendSummary],
  ] as const;
  const visibleHeadline = briefing.headline
    === "Bugün için yönetim özeti hazır; öncelikler ve takip başlıkları tek ekranda toplandı."
    && rows[0]
      ? `Bugünün ilk konusu: ${rows[0].title}`
      : briefing.headline;

  return <section aria-label="Bugünün yönetim brifingi" className="workspace-surface"><div className="workspace-surface-header"><div><p className="workspace-eyebrow">Günlük brifing</p><h2>Bugünün öncelikleri</h2><p className="workspace-subtitle">{rows.length > 0 ? visibleHeadline : "Bugün için özel bir öncelik, uyarı veya karar takibi bulunmuyor."}</p></div></div>
    {rows.length > 0 ? <div className="divide-y divide-white/[.07]">{rows.map((row, index) => <article className="px-5 py-4" key={`${row.kind}-${row.title}-${index}`}><span className="rounded-full bg-[#B8874A]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#C9BFA8]">{row.kind}</span><h3 className="mt-2 text-[15px] font-semibold leading-6 text-[#EDE7D9]">{row.title}</h3><p className="mt-1 text-[13px] leading-5 text-[#7C7466]">{row.detail}</p>{row.action ? <p className="mt-2 text-[13px] text-[#C9BFA8]"><span className="font-semibold text-[#B8874A]">Önerilen adım: </span>{row.action}</p> : null}{assessment ? <EvidenceChain evidence={assessment.evidence.slice(0, 5).map((item) => ({ evidenceId: item.id ?? item.evidenceId ?? "", summary: item.summary, sourceDomain: item.sourceDomain }))}>{null}</EvidenceChain> : null}</article>)}{hiddenCount > 0 ? <p className="px-5 py-3 text-[12px] text-[#7C7466]">+{hiddenCount} ek kayıt</p> : null}</div> : <p className="px-5 py-5 text-[13px] text-[#7C7466]">Yeni bir kayıt oluştuğunda burada gösterilecek.</p>}
    <details className="border-t border-white/[.07] px-5 py-4">
      <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-[.1em] text-[#C9BFA8]">Şirket görünümünün tamamı</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {summarySections.map(([label, value]) => <div className="rounded-[12px] border border-white/[.08] bg-white/[.02] p-3" key={label}><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#7C7466]">{label}</p><p className="mt-1 text-[13px] leading-5 text-[#EDE7D9]">{value}</p></div>)}
      </div>
    </details>
  </section>;
}

function MetrixBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-4" data-message-role="metrix">
      <span className="w-16 shrink-0 pt-px text-[11px] font-bold uppercase tracking-[.04em] text-[#30d8ed]">METRIX</span>
      <p className="max-w-[68ch] whitespace-pre-line text-[14px] font-medium leading-[1.45] text-[#cbd2df]">
        {text}
      </p>
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

function RuntimeStatus({ status }: { status: TransientStatus }) {
  return (
    <div aria-atomic="true" aria-live="polite" className="min-h-[52px] select-none" data-status-category={status.category} role="status">
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

function AttachmentSheet({ onClose, onImportClick, onSelect }: { onClose: () => void; onImportClick: () => void; onSelect: (file: File) => void }) {
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
          <button className="flex flex-col items-center gap-2" onClick={onImportClick} type="button">
            <span className="grid h-14 w-14 place-items-center rounded-[18px] border border-[#e4d8cc] bg-white shadow-[0_3px_10px_rgba(7,18,38,0.06)]">
              <SvgTable />
            </span>
            <span className="text-center text-[11px] font-semibold leading-tight text-[#6a5040]">
              Excel/CSV İçe Aktar
            </span>
          </button>
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

// ─── Import Domain Picker Sheet ────────────────────────────────────────────
// A second, visible entry point onto the same 9 spreadsheet-import wizards
// the "excel'den X aktar" voice/text commands already open — picking a
// domain here publishes the identical WorkspaceDirective, not a separate
// upload path.

function ImportDomainSheet({ onClose, onSelect }: { onClose: () => void; onSelect: (route: string, authorityKey: string) => void }) {
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
        <p className="mb-3 text-center text-[13px] font-semibold text-[#6a5040]">Hangi alana Excel/CSV aktarmak istersiniz?</p>
        <div className="grid grid-cols-3 gap-3">
          {IMPORT_DOMAIN_OPTIONS.map(({ label, route, authorityKey }) => (
            <button
              className="flex h-14 items-center justify-center rounded-[18px] border border-[#e4d8cc] bg-white text-[13px] font-semibold text-[#6a5040] shadow-[0_3px_10px_rgba(7,18,38,0.06)] transition active:bg-[#f0e8dc]"
              key={label}
              onClick={() => onSelect(route, authorityKey)}
              type="button"
            >
              {label}
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
  activeConversationId,
  isLoading,
  items,
  onClose,
  onNew,
  onSelect,
}: {
  activeConversationId: string | null;
  isLoading: boolean;
  items: ConversationSummary[] | null;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  function dismiss(after: () => void) {
    setVisible(false);
    window.setTimeout(after, 200);
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(onClose); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(58px+env(safe-area-inset-top))] z-50 flex">
      <div
        className={`absolute inset-0 bg-black/55 backdrop-blur-md transition-opacity duration-200 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={() => dismiss(onClose)}
      />
      <div
        aria-label="Sohbet Geçmişi"
        aria-modal="true"
        className={`relative flex h-full w-[min(90vw,380px)] flex-col rounded-r-[28px] border-r border-white/[.09] bg-[#0b131b]/97 shadow-[0_30px_80px_rgba(0,0,0,.55)] backdrop-blur-2xl transition-transform duration-[220ms] ease-[cubic-bezier(.16,1,.3,1)] sm:w-[360px] ${visible ? "translate-x-0" : "-translate-x-full"}`}
        role="dialog"
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-[max(20px,env(safe-area-inset-top))]">
          <p className="text-[12px] font-black uppercase tracking-[0.22em] text-[#7b8b94]">
            Sohbet Geçmişi
          </p>
          <button
            aria-label="Kapat"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/[.08] bg-white/[.04] text-[#c9d1d6] transition hover:border-white/[.16] hover:bg-white/[.08] hover:text-white active:scale-95"
            onClick={() => dismiss(onClose)}
            type="button"
          >
            <ExecutiveIcon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="shrink-0 px-5 pb-4">
          <button
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-[#C9BFA8]/30 bg-[#1C1914] text-[14px] font-bold text-[#EDE7D9] transition hover:border-[#C9BFA8]/50 hover:bg-[#1C1914] active:scale-[.98]"
            onClick={() => dismiss(onNew)}
            type="button"
          >
            + Yeni Sohbet
          </button>
        </div>
        <div className="metrix-scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          {isLoading ? (
            <p className="px-2 py-3 text-[13px] font-medium text-[#66747d]">Yükleniyor...</p>
          ) : !items || items.length === 0 ? (
            <p className="px-2 py-3 text-[13px] font-medium text-[#66747d]">
              Henüz geçmiş konuşma yok.
            </p>
          ) : (
            items.map((item) => {
              const active = item.id === activeConversationId;
              return (
                <button
                  aria-current={active ? "true" : undefined}
                  className={`group relative flex w-full flex-col items-start gap-1 rounded-2xl border px-4 py-3.5 text-left transition-colors duration-150 ${
                    active
                      ? "border-[#C9BFA8]/30 bg-[#C9BFA8]/[.09] text-[#EDE7D9]"
                      : "border-transparent bg-white/[.025] text-[#e3e8eb] hover:border-white/[.08] hover:bg-white/[.055] active:bg-white/[.07]"
                  }`}
                  key={item.id}
                  onClick={() => dismiss(() => onSelect(item.id))}
                  type="button"
                >
                  {active ? <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[2.5px] rounded-full bg-[#C9BFA8]" /> : null}
                  <span className="line-clamp-1 text-[14px] font-semibold leading-snug">
                    {item.title}
                  </span>
                  <span className={`text-[11.5px] font-medium ${active ? "text-[#EDE7D9]/70" : "text-[#66747d] group-hover:text-[#8b98a1]"}`}>
                    {formatHistoryTimestamp(item.lastMessageAt)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionDialog({ title, description, primary, onCancel, onConfirm }: { title: string; description: string; primary: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="absolute inset-0 z-[70] grid place-items-center bg-black/55 px-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="permission-title">
      <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[#1C1914] p-6 shadow-2xl">
        <h2 id="permission-title" className="text-lg font-semibold text-[#f4f7f8]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#93a0ad]">{description}</p>
        <div className="mt-6 flex justify-end gap-3"><button className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#93a0ad]" onClick={onCancel} type="button">Şimdilik Değil</button><button autoFocus className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F]" onClick={onConfirm} type="button">{primary}</button></div>
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
      <div ref={panelRef} role="menu" aria-label="Ayarlar" className="absolute right-4 top-[72px] w-[min(330px,calc(100vw-32px))] rounded-[22px] border border-white/10 bg-[#1C1914]/95 p-3 shadow-2xl backdrop-blur-xl">
        <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-[.18em] text-[#6f7a87]">Ayarlar</p>
        {!confirming ? <><button role="menuitem" className="w-full rounded-xl px-3 py-3 text-left text-sm font-semibold hover:bg-white/[.06]" onClick={onFilm} type="button">Metrix Filmi</button><div className="my-2 border-t border-white/[.08]" /><button role="menuitem" className="w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-200 hover:bg-red-400/10" onClick={() => setConfirming(true)} type="button">Çıkış Yap</button></> : <div className="p-3"><p className="text-sm leading-6 text-[#e3e8eb]">Bu cihazdaki Metrix oturumunu kapatmak istiyor musunuz?</p><div className="mt-4 flex justify-end gap-2"><button className="rounded-lg px-3 py-2 text-sm text-[#93a0ad]" disabled={busy} onClick={() => setConfirming(false)} type="button">Vazgeç</button><button className="rounded-lg bg-red-400/15 px-3 py-2 text-sm font-bold text-red-200 disabled:opacity-50" disabled={busy} onClick={() => void logout()} type="button">{busy ? "Çıkış yapılıyor…" : "Çıkış Yap"}</button></div></div>}
        {error ? <p aria-live="polite" className="m-3 text-xs text-red-200">{error}</p> : null}
      </div>
    </div>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

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

function SvgTable() {
  return (
    <svg fill="none" height="26" stroke="#8a5a2b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="26">
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M3 9h18M3 15h18M9 3v18" />
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
