"use client";

import { useEffect, useMemo, useState } from "react";

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

type MemoryCandidate = {
  id: string;
  proposedType: string;
  proposedKey: string;
  proposedValue: string;
  source: string;
  confidence: number;
  isAssumption: boolean;
  reason: string;
};

type PendingMemoryCandidatesResponse = {
  candidates: MemoryCandidate[];
  count: number;
};

type MemoryPromotionResult = {
  promoted: boolean;
  reason:
    | "PROMOTED"
    | "CANDIDATE_NOT_PENDING"
    | "DUPLICATE_ACTIVE_MEMORY"
    | "INVALID_SUPERSEDE_TARGET"
    | "SUPERSEDE_REQUIRED";
  candidateId: string;
  memoryItemId?: string;
};

type ReviewAction = "approve" | "reject" | "dismiss";

type ApiGet = <T>(path: string) => Promise<ApiResponse<T>>;

type ApiPost = <T = unknown>(
  path: string,
  body: Record<string, unknown>,
) => Promise<ApiResponse<T>>;

type MemorySuggestionsPanelProps = {
  apiGet: ApiGet;
  apiPost: ApiPost;
  canReviewMemoryCandidates: boolean;
};

export function MemorySuggestionsPanel({
  apiGet,
  apiPost,
  canReviewMemoryCandidates,
}: MemorySuggestionsPanelProps) {
  const [candidates, setCandidates] = useState<MemoryCandidate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [reviewingCandidateId, setReviewingCandidateId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!canReviewMemoryCandidates) {
      return;
    }

    void refreshCandidates();
  }, [canReviewMemoryCandidates]);

  const visibleCandidates = useMemo(() => candidates.slice(0, 3), [candidates]);
  const hiddenCount = Math.max(0, totalCount - visibleCandidates.length);

  if (!canReviewMemoryCandidates) {
    return null;
  }

  async function refreshCandidates() {
    setIsLoading(true);
    setErrorMessage(null);

    const result = await apiGet<PendingMemoryCandidatesResponse>(
      "/api/memory-candidates/pending",
    );

    if (result.ok) {
      setCandidates(result.data.candidates);
      setTotalCount(result.data.count);
    } else {
      setErrorMessage("Hafıza önerileri alınamadı.");
    }

    setIsLoading(false);
  }

  async function reviewCandidate(candidateId: string, action: ReviewAction) {
    setReviewingCandidateId(candidateId);
    setErrorMessage(null);
    setNoticeMessage(null);

    const result =
      action === "approve"
        ? await apiPost<MemoryPromotionResult>(
            `/api/memory-candidates/${candidateId}/approve`,
            {},
          )
        : await apiPost<{ success: boolean; candidate: MemoryCandidate | null }>(
            `/api/memory-candidates/${candidateId}/${action}`,
            {},
          );

    if (!result.ok) {
      setErrorMessage(result.error.message);
      setReviewingCandidateId(null);
      return;
    }

    if (action === "approve") {
      handleApprovalResult(result.data as MemoryPromotionResult);
    } else {
      removeCandidate(candidateId);
      setNoticeMessage(
        action === "reject"
          ? "Öneri reddedildi."
          : "Öneri şimdilik kapatıldı.",
      );
    }

    setReviewingCandidateId(null);
  }

  function handleApprovalResult(result: MemoryPromotionResult) {
    if (result.promoted) {
      removeCandidate(result.candidateId);
      setNoticeMessage("Hafızaya alındı.");
      return;
    }

    if (result.reason === "DUPLICATE_ACTIVE_MEMORY") {
      removeCandidate(result.candidateId);
      setNoticeMessage("Bu bilgi zaten hafızada var.");
      return;
    }

    if (result.reason === "SUPERSEDE_REQUIRED") {
      setNoticeMessage(
        "Bu öneri mevcut hafızadaki farklı bir bilgiyle çelişiyor. Düzeltme akışı sonraki sürümde açılacak.",
      );
      return;
    }

    setNoticeMessage("Öneri güncellendi.");
    void refreshCandidates();
  }

  function removeCandidate(candidateId: string) {
    setCandidates((current) =>
      current.filter((candidate) => candidate.id !== candidateId),
    );
    setTotalCount((current) => Math.max(0, current - 1));
  }

  return (
    <section className="mt-5 rounded-[22px] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.07)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.1em] text-teal-600">
            HAFIZA ÖNERİLERİ
          </p>
          <p className="mt-2 text-sm leading-5 text-slate-500">
            Bunlar henüz hafıza değil. Onaylarsan Metrix sonraki önerilerinde
            kullanabilir.
          </p>
        </div>
        <div className="rounded-full bg-teal-50 px-3 py-1.5 text-sm font-bold text-teal-700">
          {totalCount}
        </div>
      </div>

      {noticeMessage ? (
        <div className="mb-3 rounded-[14px] bg-indigo-50 px-3 py-2 text-sm font-semibold leading-5 text-indigo-700">
          {noticeMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-3 rounded-[14px] bg-red-50 px-3 py-2 text-sm font-semibold leading-5 text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <p className="rounded-[16px] bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500">
          Hafıza önerileri yükleniyor...
        </p>
      ) : null}

      {!isLoading && candidates.length === 0 ? (
        <p className="rounded-[16px] bg-slate-50 px-4 py-4 text-sm font-semibold leading-5 text-slate-500">
          Şu an onay bekleyen hafıza önerisi yok.
        </p>
      ) : null}

      {!isLoading && visibleCandidates.length > 0 ? (
        <div className="space-y-3">
          {visibleCandidates.map((candidate) => (
            <MemorySuggestionCard
              candidate={candidate}
              isReviewing={reviewingCandidateId === candidate.id}
              key={candidate.id}
              onApprove={() => reviewCandidate(candidate.id, "approve")}
              onDismiss={() => reviewCandidate(candidate.id, "dismiss")}
              onReject={() => reviewCandidate(candidate.id, "reject")}
            />
          ))}
          {hiddenCount > 0 ? (
            <p className="text-center text-xs font-bold text-slate-400">
              +{hiddenCount} öneri daha var
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MemorySuggestionCard({
  candidate,
  isReviewing,
  onApprove,
  onDismiss,
  onReject,
}: {
  candidate: MemoryCandidate;
  isReviewing: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onReject: () => void;
}) {
  return (
    <article className="rounded-[18px] bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
            {formatCandidateKey(candidate.proposedKey)}
          </p>
          <p className="mt-1 line-clamp-3 text-[15px] font-bold leading-5 text-slate-950">
            {candidate.proposedValue}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm">
            %{candidate.confidence}
          </span>
          {candidate.isAssumption ? (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
              Varsayım
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
        <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-600">
          {candidate.proposedType}
        </span>
        <span className="rounded-full bg-white px-2 py-1 text-slate-500">
          {candidate.source}
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-slate-500">
        {candidate.reason}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          className="min-h-11 rounded-full bg-teal-600 px-2 text-xs font-bold text-white shadow-[0_10px_24px_rgba(13,148,136,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isReviewing}
          onClick={onApprove}
          type="button"
        >
          {isReviewing ? "..." : "Hafızaya al"}
        </button>
        <button
          className="min-h-11 rounded-full bg-white px-2 text-xs font-bold text-red-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isReviewing}
          onClick={onReject}
          type="button"
        >
          Yanlış
        </button>
        <button
          className="min-h-11 rounded-full bg-white px-2 text-xs font-bold text-slate-500 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isReviewing}
          onClick={onDismiss}
          type="button"
        >
          Şimdilik geç
        </button>
      </div>
    </article>
  );
}

function formatCandidateKey(value: string): string {
  return value.replace(/_/g, " ");
}
