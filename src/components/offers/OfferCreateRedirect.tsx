"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createOfferForCustomer } from "@/lib/offers/create-offer-for-customer";
import { GlassCard, PageShell } from "@/components/customers/ui";

/**
 * "Atlas için yeni teklif hazırla" lands here: creates the real DRAFT Quote
 * record immediately (this *is* the Draft in the Conversation -> Living
 * Workspace -> Draft chain, not a client-only staging area — see
 * quote.create/createNewQuote), then hands off to Offer Edit where the same
 * conversational command chain Customer Edit uses takes over.
 */
export function OfferCreateRedirect({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const result = await createOfferForCustomer(customerId);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.replace(`/metrix/offers/${result.quoteId}/edit`);
    })();
  }, [customerId, router]);

  if (error) {
    return (
      <PageShell>
        <GlassCard className="mt-6 p-6 text-center">
          <p className="text-sm font-semibold text-[#f16a7a]">Teklif oluşturulamadı.</p>
          <p className="mt-2 text-xs text-[#6f7a87]">{error}</p>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <p className="mt-10 text-center text-sm text-[#6f7a87]">Teklif hazırlanıyor...</p>
    </PageShell>
  );
}
