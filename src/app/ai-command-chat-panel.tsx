"use client";

import { useEffect, useRef, useState } from "react";

import type { FormEvent } from "react";

type ApiResponse<T> =
  | {
      ok: true;
      data: T;
      status?: number;
    }
  | {
      ok: false;
      error: {
        message: string;
      };
      status?: number;
    };

type ApiPost = <T = unknown>(
  path: string,
  body: Record<string, unknown>,
) => Promise<ApiResponse<T>>;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: AiChatMetadata;
};

type AiChatMetadata = {
  learningLoop?: {
    prompt?: unknown;
  };
  managerAdvice?: unknown;
  executiveBrain?: {
    mode?: "shadow" | "unavailable" | "error";
    generatedAt?: string;
    brief?: unknown;
    decisionPackage?: unknown;
    councilSummary?: string;
    strategicProfileSummary?: string;
    confidence?: number;
    reason?: string;
    error?: string;
  } | null;
};

type AiChatResponse = {
  conversationId: string;
  ai: {
    content: string;
    provider: string;
    model: string;
    memoryContextSummary: {
      totalIncluded: number;
      highlights: number;
      facts: number;
      processes: number;
      strategic: number;
      preferences: number;
      conflicts: number;
    };
    metadata?: AiChatMetadata;
  };
};

type AiCommandChatPanelProps = {
  apiPost: ApiPost;
  onClose?: () => void;
};

const MAX_MESSAGE_LENGTH = 4000;

export function AiCommandChatPanel({ apiPost, onClose }: AiCommandChatPanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const trimmedInput = inputValue.trim();
  const isMessageTooLong = inputValue.length > MAX_MESSAGE_LENGTH;
  const canSubmit =
    trimmedInput.length > 0 && !isMessageTooLong && !isSubmitting;

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;

    if (!scrollArea) {
      return;
    }

    scrollArea.scrollTop = scrollArea.scrollHeight;
  }, [messages, errorMessage, isSubmitting]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const userMessage: ChatMessage = {
      id: buildMessageId("user"),
      role: "user",
      content: trimmedInput,
    };

    setMessages((current) => [...current, userMessage]);
    setInputValue("");
    setIsSubmitting(true);
    setErrorMessage(null);

    const body: Record<string, unknown> = {
      message: trimmedInput,
    };

    if (conversationId) {
      body.conversationId = conversationId;
    }

    const result = await apiPost<AiChatResponse>("/api/ai/chat", body);

    if (result.ok) {
      setConversationId(result.data.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: buildMessageId("assistant"),
          role: "assistant",
          content: result.data.ai.content,
          metadata: result.data.ai.metadata,
        },
      ]);
    } else {
      setErrorMessage(buildErrorMessage(result.status, result.error.message));
    }

    setIsSubmitting(false);
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#eef2f0] text-slate-950">
      <ChatHeader onClose={onClose} />

      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-5 pt-6 sm:px-8 lg:px-10"
        ref={scrollAreaRef}
      >
        {messages.length === 0 ? <EmptyConversation /> : null}

        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}

        {isSubmitting ? <TypingCard /> : null}

        {errorMessage ? (
          <div className="rounded-[18px] bg-red-50 px-4 py-3 text-sm font-semibold leading-5 text-red-700 shadow-[0_12px_32px_rgba(239,68,68,0.08)]">
            {errorMessage}
          </div>
        ) : null}

        {isMessageTooLong ? (
          <div className="rounded-[18px] bg-amber-50 px-4 py-3 text-sm font-semibold leading-5 text-amber-700 shadow-[0_12px_32px_rgba(245,158,11,0.08)]">
            Mesaj 4000 karakterden uzun olamaz.
          </div>
        ) : null}
      </div>

      <form
        className="shrink-0 border-t border-slate-200/70 bg-[#eef2f0]/90 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-8 lg:px-10"
        onSubmit={submitMessage}
      >
        <div className="flex min-h-16 items-center gap-3 rounded-[26px] border border-slate-200 bg-white/95 px-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] ring-1 ring-white">
          <input
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-950 outline-none placeholder:text-slate-500 disabled:opacity-70"
            disabled={isSubmitting}
            maxLength={MAX_MESSAGE_LENGTH + 1}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Bugün hangi kararı netleştirelim?"
            value={inputValue}
          />
          <button
            aria-label="Gönder"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-950 to-indigo-700 text-xl font-black text-white shadow-[0_14px_34px_rgba(79,70,229,0.22)] disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-500 disabled:shadow-none"
            disabled={!canSubmit}
            type="submit"
          >
            →
          </button>
        </div>
      </form>
    </section>
  );
}

function ChatHeader({ onClose }: { onClose?: () => void }) {
  return (
    <header className="shrink-0 border-b border-slate-200/70 bg-[#eef2f0]/90 px-4 pb-4 pt-[max(16px,env(safe-area-inset-top))] backdrop-blur-xl sm:px-8 lg:px-10">
      <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3">
        <button
          aria-label="Geri"
          className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-2xl text-slate-950 shadow-[0_14px_34px_rgba(15,23,42,0.08)]"
          onClick={onClose}
          type="button"
        >
          ‹
        </button>

        <div className="flex min-w-0 items-center gap-3">
          <MetrixMascot size="large" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[22px] font-black tracking-normal text-slate-950 sm:text-[24px]">
                AI Genel Müdür
              </h2>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-indigo-600 text-[10px] font-black text-white">
                ✓
              </span>
            </div>
            <p className="mt-1 truncate text-[13px] font-medium text-slate-600">
              Şirketini izler, değerlendirir ve yönlendirir.
            </p>
          </div>
        </div>

        <button
          className="hidden h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:flex"
          type="button"
        >
          <span>↶</span>
          Geçmiş
        </button>
      </div>
    </header>
  );
}

function EmptyConversation() {
  return (
    <div className="mx-auto flex min-h-[54vh] max-w-2xl flex-col justify-center py-8">
      <div className="rounded-[32px] border border-white bg-white/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-8">
        <MetrixMascot size="large" />
        <p className="mt-6 text-[28px] font-black leading-tight text-slate-950 sm:text-[34px]">
          Günaydın.
        </p>
        <p className="mt-3 text-[18px] font-semibold leading-7 text-slate-800 sm:text-[20px]">
          Bugün şirketi birlikte netleştirelim.
        </p>
        <p className="mt-4 max-w-xl text-[14px] font-medium leading-6 text-slate-600">
          Aklındaki konuyu yaz; ben nakit, müşteri, ekip ve operasyon etkisini
          birlikte düşünerek yanıtlayacağım.
        </p>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return <UserMessageBubble message={message} />;
  }

  return <AssistantMessageCard message={message} />;
}

function UserMessageBubble({ message }: { message: ChatMessage }) {
  return (
    <article className="ml-auto max-w-[82%] rounded-[22px] rounded-br-md bg-gradient-to-br from-indigo-600 to-slate-950 px-4 py-3 shadow-[0_18px_48px_rgba(79,70,229,0.18)] sm:max-w-[70%]">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-[12px] font-black text-white/80">Sen</p>
      </div>
      <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-6 text-white">
        {message.content}
      </p>
    </article>
  );
}

function AssistantMessageCard({ message }: { message: ChatMessage }) {
  const summary = message.content.trim();

  return (
    <article className="max-w-[92%] sm:max-w-[78%]">
      <div className="mb-2 flex items-center gap-2">
        <MetrixMascot size="small" />
        <span className="text-[14px] font-black text-slate-700">
          AI Genel Müdür
        </span>
      </div>

      <div className="rounded-[26px] rounded-tl-md border border-white bg-white/85 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.11)] backdrop-blur-xl sm:p-5">
        <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-7 text-slate-950">
          {summary}
        </p>
      </div>
    </article>
  );
}

function TypingCard() {
  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-white bg-white/75 px-4 py-3 text-sm font-bold text-slate-600 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
      <MetrixMascot size="small" />
      <span>AI Müdür değerlendiriyor...</span>
    </div>
  );
}

function MetrixMascot({ size }: { size: "small" | "large" }) {
  const dimensions = size === "large" ? "h-16 w-16" : "h-10 w-10";
  const face = size === "large" ? "h-9 w-11" : "h-6 w-7";

  return (
    <div
      className={`relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-100 via-violet-100 to-white shadow-[0_10px_28px_rgba(99,102,241,0.18)] ${dimensions}`}
    >
      <div
        className={`relative rounded-[40%] bg-slate-950 shadow-[inset_0_-6px_12px_rgba(99,102,241,0.5)] ${face}`}
      >
        <span className="absolute left-[22%] top-[32%] h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.9)]" />
        <span className="absolute right-[22%] top-[32%] h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
        <span className="absolute left-1/2 top-[10%] h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-300" />
      </div>
    </div>
  );
}

function buildErrorMessage(status: number | undefined, fallback: string): string {
  if (status === 400) {
    return "Mesaj geçersiz veya çok uzun.";
  }

  if (status === 401) {
    return "Devam etmek için oturum gerekli.";
  }

  if (status === 403) {
    return "Bu konuşmaya erişim yetkin yok.";
  }

  if (fallback.trim().length > 0 && fallback !== "Unexpected error.") {
    return fallback;
  }

  return "AI yanıtı alınamadı.";
}

function buildMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
