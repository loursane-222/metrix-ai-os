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
import { DailyExecutiveSummaryV2 } from "./DailyExecutiveSummaryV2";
import { ExecutiveStroke, PendingWorkRail } from "@/components/executive-signatures/SignatureComponents";
import { atmosphereTone, useAtmosphereAssessment, type AtmosphereAssessment } from "@/components/living-workspace/AtmosphereAssessmentContext";
import { usePendingWork, type PendingWorkItem } from "@/components/executive-signatures/usePendingWork";
import { BrandFilmPlayer } from "@/components/brand-film/BrandFilmPlayer";
import { useExecutiveHeaderActions } from "@/components/living-workspace/ExecutiveHeaderActionsContext";
import { ExecutiveIcon } from "@/components/living-workspace/ExecutiveIcons";
import { useWorkspacePresentation } from "@/components/living-workspace/WorkspacePresentationContext";
import { MetrixEcosystemField } from "./MetrixEcosystemField";
import historyStyles from "./HistorySheet.module.css";
import permissionStyles from "./PermissionDialog.module.css";
import settingsStyles from "./SettingsMenu.module.css";
import type { ApprovalLifecycleEnvelope, ExecutiveLifecycleEnvelope } from "@/lib/executive-lifecycle";
import { DOMAIN_SURFACE_ADAPTERS, useActiveWorkspaceContext, type WorkspaceDomain } from "@/lib/living-workspace";
import { silentPreparationRuntime } from "@/lib/executive-signatures/silent-preparation-runtime";
import type { ExecutiveDailyBriefingV2 } from "@/lib/executive-daily-briefing-v2";
import { ATTACHMENT_SESSION_CHANGED_EVENT, bindActiveAttachmentConversation, clearBrowserAttachmentSession, getActiveAttachment, readBrowserAttachmentSession, setActiveAttachment, type AttachmentReference } from "@/lib/conversation-attachments/attachment-session";
import { clearActiveDocumentAttachment, setActiveDocumentAttachment } from "@/lib/documents/document-attachment-session";
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
  const [dismissedBriefingIndexes, setDismissedBriefingIndexes] = useState<ReadonlySet<number>>(new Set());
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
  const attachmentTriggerRef = useRef<HTMLButtonElement>(null);
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
  // Tracks which server-side response phase ("opening" vs "primary"/
  // "enrichment") the currently-buffered streaming text belongs to. The
  // opening phase is a transient latency affordance from a second,
  // independent model call (see createMetrixOpeningStream in route.ts) that
  // must never visually fuse with the canonical answer that follows it —
  // confirmed live: an opening self-description sentence glued directly to
  // the start of an unrelated canonical answer, read by the user as one
  // broken, self-contradictory reply.
  const activeChunkPhaseRef = useRef<string | null>(null);
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

  // Single upload choke point for every Plus Menu file action (Dosya Yükle /
  // Fotoğraf Çek / Fotoğraf Seç). The row this creates is the SAME
  // CustomerDocumentAttachment table Document Intelligence (Phase 14) reads
  // — so uploading here and dual-binding both session pointers is enough to
  // make the generic (non-customer) document pipeline reachable without a
  // second upload call, a second endpoint, or any UI change: the existing
  // customer-document coordinator keeps resolving this exact row exactly as
  // before via setActiveAttachment, and the new document-intelligence
  // conversation extension can now also find it via
  // setActiveDocumentAttachment. Which one actually acts on it is decided
  // later, purely by which trigger phrase the user types — never by upload.
  async function uploadAttachment(file: File) { setIsAttachOpen(false); setIsAttachmentUploading(true); setError(null); const form = new FormData(); form.set("file", file); if (conversationId) form.set("conversationId", conversationId); try { const response = await fetch("/api/customers/document-attachments", { method: "POST", credentials: "include", body: form }); const json = await response.json() as ApiResponse<AttachmentReference>; if (!json.ok) { setError(json.error.message); return; } setAttachment(json.data); setActiveAttachment(json.data); setActiveDocumentAttachment(json.data); } catch { setError(buildExecutiveFallbackResponse("connection_lost")); } finally { setIsAttachmentUploading(false); } }

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
    activeChunkPhaseRef.current = null;
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
            const chunkPhase = typeof event.phase === "string" ? event.phase : null;
            if (navigationCompletionPromise && !navigationCompletion) navigationCompletion = await navigationCompletionPromise;
            if (navigationCompletion && navigationCompletion.status !== "COMPLETED") return;
            // The opening phase is a disposable latency affordance from an
            // independent model call — it must never be read aloud as if it
            // were the canonical answer (spoken words can't be silently
            // "erased" the way on-screen text can), and any transition out
            // of it must replace, not extend, whatever it already buffered.
            const isOpeningPhase = chunkPhase === "opening";
            if (activeChunkPhaseRef.current === "opening" && chunkPhase !== "opening") {
              streamingContentRef.current = "";
              pendingBufferRef.current = "";
            }
            activeChunkPhaseRef.current = chunkPhase;
            if (isVoice && !isOpeningPhase) {
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
        <button aria-label="Dosya ekle" className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[.14] text-[#9aa7b0] transition hover:border-white/[.24] hover:bg-white/[.05] hover:text-[#c9d1d6] active:bg-white/[.08]" disabled={isThinking} onClick={() => setIsAttachOpen(true)} ref={attachmentTriggerRef} type="button"><SvgPlus /></button>
        <textarea className="min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] font-medium leading-[1.5] text-[#f4f7f8] outline-none placeholder:text-[#5c6673] disabled:opacity-50" disabled={isThinking} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={isThinking || (orchestrator.isConnected && isVoiceResponding) ? "Metrix yanıtlıyor..." : orchestrator.isConnected && isVoiceListening ? "Dinleniyor..." : "Metrix ile konuş..."} ref={textareaRef} rows={1} value={draft}/>
        {draft.trim() && !isThinking ? <button aria-label="Gönder" className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#C9BFA8] text-[#14120F] transition hover:bg-[#DDD4BE] active:bg-[#C9BFA8]" onClick={() => void send()} type="button"><SvgArrowUp /></button> : <button aria-label={micPermission === "requesting" ? "Toplantıya bağlanıyor" : orchestrator.isConnected && isVoiceListening ? "Dinleniyor — durdurmak için dokun" : orchestrator.isConnected && isVoiceResponding ? "Metrix yanıtlıyor — durdurmak için dokun" : "Toplantıya başla"} className={`mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${micPermission === "requesting" ? "animate-pulse bg-[#1c6e73] text-white" : orchestrator.isConnected && isVoiceListening ? "bg-[#1C1914] text-[#EDE7D9] ring-2 ring-[#C9BFA8] ring-offset-1 ring-offset-[#14120F]" : "bg-[#1C1914] text-[#EDE7D9] hover:bg-[#1C1914] active:bg-[#0a151c]"}`} disabled={isThinking || micPermission === "requesting"} onClick={() => void handleMicClick()} type="button"><SvgMic /></button>}
      </div>
      {micPermission === "requesting" ? <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#EDE7D9]">Toplantıya bağlanıyor...</p> : orchestrator.connectionError ? <div className="px-2 pt-2 text-center text-[12px] font-medium text-[#f0a090]"><p>{orchestrator.connectionError}</p>{orchestrator.playbackBlocked ? <button className="mt-2 rounded-lg border border-[#f0a090]/40 px-3 py-1.5 font-bold" onClick={() => void orchestrator.retryPlayback()} type="button">Tekrar dinle</button> : null}</div> : orchestrator.isConnected && isVoiceListening ? <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#8a5a2b]">Dinleniyor — konuşabilirsiniz</p> : micPermission === "denied" ? <p className="px-2 pt-2 text-center text-[12px] font-medium text-[#b8a898]">Toplantı başlatılamadı. Lütfen tekrar dene.</p> : null}
    </div>
  );
  const conversationOverlays = <>
    {isAttachOpen ? <AttachmentSheet onClose={() => { setIsAttachOpen(false); requestAnimationFrame(() => attachmentTriggerRef.current?.focus()); }} onImportClick={() => { setIsAttachOpen(false); setIsImportPickerOpen(true); }} onSelect={(file) => void uploadAttachment(file)} /> : null}
    {isImportPickerOpen ? <ImportDomainSheet onClose={() => { setIsImportPickerOpen(false); requestAnimationFrame(() => attachmentTriggerRef.current?.focus()); }} onSelect={(route, authorityKey) => { void dispatchConversationNavigation({ route, source: "written", correlationId: crypto.randomUUID(), expectedSurfaceAuthorityKey: authorityKey }); setIsImportPickerOpen(false); }} /> : null}
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
        {attachment || isAttachmentUploading ? <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#e4d8cc] bg-white px-3 py-2 text-xs font-semibold text-[#6a5040]"><SvgFile /><span className="min-w-0 flex-1 truncate">{isAttachmentUploading ? "Belge yükleniyor…" : attachment?.filename}</span>{attachment ? <button aria-label="Belgeyi kaldır" onClick={() => { void fetch(`/api/customers/document-attachments/${encodeURIComponent(attachment.attachmentRef)}`, { method: "DELETE", credentials: "include" }); setAttachment(null); setAttachmentPreview(null); clearActiveDocumentAttachment(); }} type="button">×</button> : null}</div> : null}
        <div className={`mx-auto w-full max-w-3xl ${isEmptyConversation ? "space-y-9" : "space-y-2.5"}`}>
          <ExecutiveFacePresence behaviorStatus={behaviorSnapshot.status} voicePresence={orchestrator.presence.kind} />
          {pendingApprovals.length ? <div className="grid gap-2">{pendingApprovals.map((approval) => <PendingWorkRail key={approval.envelope.approval.approvalId} work={{ title: approval.envelope.summary, nextStep: "Onay veya ret kararı gerekiyor", onPrimary: () => void decideApprovalFromPanel(approval.envelope.approval.approvalId, "approve", approval), onCancel: () => void decideApprovalFromPanel(approval.envelope.approval.approvalId, "reject", approval), primaryContent: <ExecutiveStroke label="Kararı kesinleştir" onCommit={() => void decideApprovalFromPanel(approval.envelope.approval.approvalId, "approve", approval)} /> }} />)}</div> : null}
          {messages.map((msg, i) =>
            msg.role === "metrix" ? (
              msg.dailyBriefing ? (
                dismissedBriefingIndexes.has(i) ? (
                  <MetrixBubble key={i} text="Günlük yönetici özeti kapatıldı." />
                ) : (
                  <DailyExecutiveSummaryV2 briefing={msg.dailyBriefing} key={i} onClose={() => setDismissedBriefingIndexes((prev) => new Set(prev).add(i))} />
                )
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

function attachmentActionHint(label: string): string {
  if (label === "Dosya Yükle") return "JPEG, PNG, WebP veya PDF";
  if (label === "Fotoğraf Çek") return "Kamerayı kullan";
  return "Galeriden seç";
}

function useLocalSheetA11y<T extends HTMLElement, F extends HTMLElement>(
  sheetRef: React.RefObject<T | null>,
  initialFocusRef: React.RefObject<F | null>,
  onClose: () => void,
) {
  useEffect(() => {
    initialFocusRef.current?.focus();
    const sheet = sheetRef.current;
    if (!sheet) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    sheet.addEventListener("keydown", onKeyDown);
    return () => sheet.removeEventListener("keydown", onKeyDown);
  }, [initialFocusRef, onClose, sheetRef]);
}

function AttachmentSheet({ onClose, onImportClick, onSelect }: { onClose: () => void; onImportClick: () => void; onSelect: (file: File) => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);
  useLocalSheetA11y(sheetRef, initialFocusRef, onClose);
  return (
    <div aria-labelledby="attachment-sheet-title" aria-modal="true" className="metrix-attachment-layer absolute inset-0 z-50 flex flex-col justify-end" ref={sheetRef} role="dialog">
      <div
        className="metrix-sheet-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div
        className="metrix-action-sheet relative"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
      >
        <div className="metrix-sheet-handle" />
        <div className="metrix-sheet-heading"><strong id="attachment-sheet-title">Ekle</strong><span>Bir kaynak seçin</span></div>
        <div className="metrix-attachment-actions">
          {ATTACH_OPTIONS.map(({ label, Icon, accept, capture }, index) => (
            <label
              className="metrix-attachment-action"
              key={label}
            >
              <input accept={accept} capture={capture} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onSelect(file); }} ref={index === 0 ? initialFocusRef : undefined} type="file" />
              <span className="metrix-attachment-icon">
                <Icon />
              </span>
              <span className="metrix-attachment-copy"><strong>{label}</strong><small>{attachmentActionHint(label)}</small></span>
            </label>
          ))}
          <button className="metrix-attachment-action" onClick={onImportClick} type="button">
            <span className="metrix-attachment-icon">
              <SvgTable />
            </span>
            <span className="metrix-attachment-copy"><strong>Excel/CSV İçe Aktar</strong><small>9 iş alanından birini seç</small></span><span aria-hidden="true" className="metrix-action-chevron">›</span>
          </button>
        </div>
        <button
          className="metrix-sheet-cancel"
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  useLocalSheetA11y(sheetRef, initialFocusRef, onClose);
  return (
    <div aria-labelledby="import-domain-sheet-title" aria-modal="true" className="metrix-attachment-layer absolute inset-0 z-50 flex flex-col justify-end" ref={sheetRef} role="dialog">
      <div
        className="metrix-sheet-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div
        className="metrix-action-sheet metrix-domain-sheet relative"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
      >
        <div className="metrix-sheet-handle" />
        <div className="metrix-sheet-heading"><strong id="import-domain-sheet-title">Excel/CSV İçe Aktar</strong><span>Bir iş alanı seçin</span></div>
        <div className="metrix-import-domains">
          {IMPORT_DOMAIN_OPTIONS.map(({ label, route, authorityKey }, index) => (
            <button
              className="metrix-import-domain"
              key={label}
              onClick={() => onSelect(route, authorityKey)}
              ref={index === 0 ? initialFocusRef : undefined}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="metrix-sheet-cancel"
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
  // Presentation baseline replaces the former utility panel (w-[min(90vw,380px)], bg-[#0b131b]/97)
  // while retaining the existing + Yeni Sohbet behavior contract.
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
    <div className={historyStyles.overlay}>
      <div
        className={`${historyStyles.scrim} ${visible ? historyStyles.scrimVisible : ""}`}
        onClick={() => dismiss(onClose)}
      />
      <div
        aria-label="Sohbet Geçmişi"
        aria-modal="true"
        className={`${historyStyles.panel} ${visible ? historyStyles.panelVisible : ""}`}
        role="dialog"
      >
        <div className={historyStyles.header}>
          <div><p className={historyStyles.eyebrow}>METRIX / KAYITLI AKIŞ</p><h2>Sohbet Geçmişi</h2><p className={historyStyles.subline}>Önceki konuşmalarınıza devam edin.</p></div>
          <button
            aria-label="Kapat"
            className={historyStyles.close}
            onClick={() => dismiss(onClose)}
            type="button"
          >
            <ExecutiveIcon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className={historyStyles.newWrap}>
          <button
            className={historyStyles.newChat}
            onClick={() => dismiss(onNew)}
            type="button"
          >
            <svg aria-hidden="true" className={historyStyles.plusIcon} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg> Yeni Sohbet <kbd>⌘ N</kbd>
          </button>
        </div>
        <div className={historyStyles.list}>
          <p className={historyStyles.listLabel}>SON KONUŞMALAR</p>
          {isLoading ? (
            <p className={historyStyles.state}>Yükleniyor...</p>
          ) : !items || items.length === 0 ? (
            <p className={historyStyles.state}>
              Henüz geçmiş konuşma yok.
            </p>
          ) : (
            items.map((item) => {
              const active = item.id === activeConversationId;
              return (
                <button
                  aria-current={active ? "true" : undefined}
                  className={`${historyStyles.row} ${active ? historyStyles.active : ""}`}
                  key={item.id}
                  onClick={() => dismiss(() => onSelect(item.id))}
                  type="button"
                >
                  {active ? <span aria-hidden="true" className={historyStyles.mark} /> : null}
                  <span className={historyStyles.title}>
                    {item.title}
                  </span>
                  <span className={historyStyles.timestamp}>
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <div className={permissionStyles.overlay} role="dialog" aria-modal="true" aria-labelledby="permission-title" aria-describedby="permission-description">
      <div className={permissionStyles.dialog} ref={dialogRef}>
        <div className={permissionStyles.context}><span className={permissionStyles.micSymbol}><PermissionMicIcon /></span><span>SESLİ GÖRÜŞME</span></div>
        <h2 id="permission-title">{title}</h2>
        <p id="permission-description">{description}</p>
        <div className={permissionStyles.actions}><button className={permissionStyles.secondary} onClick={onCancel} type="button">Şimdilik Değil</button><button autoFocus className={permissionStyles.primary} onClick={onConfirm} type="button"><span><PermissionMicIcon /></span>{primary}</button></div>
      </div>
    </div>
  );
}

function PermissionMicIcon() {
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24"><rect height="10" rx="3" width="6" x="9" y="3" /><path d="M18 10v2a6 6 0 0 1-12 0v-2M12 18v3M9 21h6" /></svg>;
}

function SettingsMenu({ onClose, onFilm }: { onClose: () => void; onFilm: () => void }) {
  const [view, setView] = useState<"menu" | "logout" | "account">("menu");
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
    <div className={settingsStyles.overlay} data-settings-overlay onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Ayarlar" className={settingsStyles.shell} data-settings-shell>
        <aside className={settingsStyles.rail} data-settings-rail>
          <p className={settingsStyles.eyebrow}>Ayarlar</p>
          <button className={`${settingsStyles.railItem} ${view === "account" || view === "menu" ? settingsStyles.active : ""}`} onClick={() => setView("account")} type="button">
            <span className={settingsStyles.iconCircle}><SettingsAccountIcon /></span><span>Hesap Ayarları</span>
          </button>
          <button className={settingsStyles.railItem} onClick={onFilm} type="button">
            <span className={settingsStyles.iconPlain}><SettingsFilmIcon /></span><span>Metrix Filmi</span><SettingsChevronIcon />
          </button>
          <button className={`${settingsStyles.railItem} ${settingsStyles.danger} ${view === "logout" ? settingsStyles.activeDanger : ""}`} onClick={() => setView("logout")} type="button">
            <span className={settingsStyles.iconPlain}><SettingsLogoutIcon /></span><span>Çıkış Yap</span>
          </button>
          <div className={settingsStyles.railFoot}><span />Kullanıcı ayarları</div>
        </aside>
        <section className={settingsStyles.content} data-settings-content>
          <div className={settingsStyles.contentHead}>
            <p className={settingsStyles.kicker}>{view === "logout" ? "Oturum" : "Kişisel profil"}</p>
            <h1>{view === "logout" ? "Çıkış Yap" : "Hesap Ayarları"}</h1>
            <p>{view === "logout" ? "Bu cihazdaki Metrix oturumunu güvenli biçimde sonlandırın." : "METRIX deneyiminizde kullanılan kişisel bilgileri yönetin."}</p>
          </div>
          <div className={settingsStyles.contentBody}>
            {view === "logout" ? <div className={settingsStyles.logoutPanel}><span className={settingsStyles.logoutSymbol}><SettingsLogoutIcon /></span><h2>Oturumu kapat</h2><p>Bu cihazdaki Metrix oturumunu kapatmak istiyor musunuz?</p><div className={settingsStyles.logoutActions}><button disabled={busy} onClick={() => setView("account")} type="button">Vazgeç</button><button className={settingsStyles.confirmLogout} disabled={busy} onClick={() => void logout()} type="button">{busy ? "Çıkış yapılıyor…" : "Çıkış Yap"}</button></div></div> : <AccountSettingsForm onBack={() => setView("menu")} />}
            {error ? <p aria-live="polite" className={settingsStyles.menuError}>{error}</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function AccountSettingsForm({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [voicePreference, setVoicePreference] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/user/profile", { credentials: "include" });
        const result = await response.json() as { ok: boolean; data?: { user: { fullName: string | null; email: string | null; timezone: string; voicePreference: string | null } }; error?: { message?: string } };
        if (!response.ok || !result.ok || !result.data) throw new Error(result.error?.message ?? "Profil yüklenemedi.");
        if (cancelled) return;
        setFullName(result.data.user.fullName ?? "");
        setEmail(result.data.user.email ?? "");
        setTimezone(result.data.user.timezone);
        setVoicePreference(result.data.user.voicePreference ?? "executive_male");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Profil yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const patch: Record<string, string> = {};
      if (fullName.trim()) patch.fullName = fullName;
      if (email.trim()) patch.email = email;
      if (timezone.trim()) patch.timezone = timezone;
      if (voicePreference.trim()) patch.voicePreference = voicePreference;

      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await response.json() as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Kaydedilemedi.");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={settingsStyles.loading} aria-live="polite"><span />Yükleniyor…</div>;

  return (
    <div className={settingsStyles.accountForm}>
      <label className={settingsStyles.fieldRow}><span className={settingsStyles.fieldCopy}><strong>Ad Soyad</strong><small>METRIX’in size hitap ederken kullandığı ad.</small></span><input value={fullName} onChange={(event) => setFullName(event.target.value)} type="text" /></label>
      <label className={settingsStyles.fieldRow}><span className={settingsStyles.fieldCopy}><strong>E-posta</strong><small>Hesabınız ve oturumunuzla ilişkili e-posta adresi.</small></span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></label>
      <label className={settingsStyles.fieldRow}><span className={settingsStyles.fieldCopy}><strong>Saat Dilimi</strong><small>Tarih, saat ve günlük özetlerin yerel zaman referansı.</small></span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} type="text" /></label>
      <label className={settingsStyles.fieldRow}><span className={settingsStyles.fieldCopy}><strong>Ses</strong><small>Sesli sohbette METRIX&apos;i hangi sesle duymak istersiniz.</small></span><select value={voicePreference} onChange={(event) => setVoicePreference(event.target.value)}><option value="executive_male">Erkek Genel Müdür Sesi</option><option value="executive_female">Kadın Genel Müdür Sesi</option></select></label>
      <div className={settingsStyles.formFoot}>
        <div>{error ? <p aria-live="polite" className={settingsStyles.formError}>{error}</p> : null}{saved ? <p aria-live="polite" className={settingsStyles.saved}>Kaydedildi.</p> : null}</div>
        <div className={settingsStyles.formActions}><button disabled={saving} onClick={onBack} type="button">Geri</button><button className={settingsStyles.save} disabled={saving} onClick={() => void save()} type="button">{saving ? "Kaydediliyor…" : "Kaydet"}</button></div>
      </div>
    </div>
  );
}

function SettingsAccountIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"/><path d="M5.6 19c.8-4 3-6 6.4-6s5.6 2 6.4 6"/></svg>; }
function SettingsFilmIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 8h14v11H5zM5 8l3-4h4L9 8m3 0 3-4h4l-3 4M5 12h14"/></svg>; }
function SettingsLogoutIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 5H5v14h5M13 8l4 4-4 4m4-4H9"/></svg>; }
function SettingsChevronIcon() { return <svg aria-hidden="true" className={settingsStyles.chevron} viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>; }

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
    <svg fill="none" height="26" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="26">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function SvgTable() {
  return (
    <svg fill="none" height="26" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="26">
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  );
}

function SvgCamera() {
  return (
    <svg fill="none" height="26" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="26">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function SvgPhoto() {
  return (
    <svg fill="none" height="26" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="26">
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
