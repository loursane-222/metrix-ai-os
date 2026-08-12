"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createOfferForCustomer } from "@/lib/offers/create-offer-for-customer";
import { GlassCard, PageShell } from "@/components/customers/ui";
import { OfferEditScreen } from "./OfferEditScreen";

type OfferCreateState =
  | { status: "creating" }
  | { status: "ready"; quoteId: string }
  | { status: "error"; message: string };

/**
 * Silently creates a DRAFT quote for the pre-selected customer (same
 * createOffer() call the working "[X] için teklif oluştur" written path
 * already makes), then hands off to OfferEditScreen for the item/terms/
 * notes fields — no duplicate form, no rewritten field logic.
 */
export function OfferCreateScreen({
  customerId,
  presentation = "route",
  onSurfaceReady,
  onSurfaceFailure,
}: {
  customerId: string;
  presentation?: "route" | "living";
  onSurfaceReady?: () => void;
  onSurfaceFailure?: () => void;
}) {
  const [state, setState] = useState<OfferCreateState>({ status: "creating" });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let active = true;
    void (async () => {
      const result = await createOfferForCustomer(customerId);
      if (!active) return;
      if (!result.ok) {
        setState({ status: "error", message: result.error });
        return;
      }
      setState({ status: "ready", quoteId: result.quoteId });
    })();
    return () => { active = false; };
  }, [customerId]);

  useEffect(() => {
    if (state.status === "error") onSurfaceFailure?.();
  }, [state.status, onSurfaceFailure]);

  if (state.status === "error") {
    return (
      <OfferCreatePageShell presentation={presentation}>
        <GlassCard className="mt-6 p-6 text-center">
          <p className="text-sm font-semibold text-[#f16a7a]">Teklif oluşturulamadı.</p>
          <p className="mt-2 text-xs text-[#6f7a87]">{state.message}</p>
        </GlassCard>
      </OfferCreatePageShell>
    );
  }

  if (state.status === "creating") {
    return (
      <OfferCreatePageShell presentation={presentation}>
        <p className="mt-10 text-center text-sm text-[#6f7a87]">Teklif oluşturuluyor...</p>
      </OfferCreatePageShell>
    );
  }

  return (
    <OfferEditScreen
      onSurfaceFailure={onSurfaceFailure}
      onSurfaceReady={onSurfaceReady}
      presentation={presentation === "living" ? "living" : "route"}
      quoteId={state.quoteId}
    />
  );
}

function OfferCreatePageShell({ presentation, children }: { presentation: "route" | "living"; children: ReactNode }) {
  if (presentation === "living") return <div className="mx-auto h-full min-h-0 w-full max-w-3xl overflow-y-auto overscroll-contain px-1 pb-6">{children}</div>;
  return <PageShell>{children}</PageShell>;
}
