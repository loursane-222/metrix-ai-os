"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTRY, listQuotes, type QuoteRecord, type QuoteStatus } from "@/lib/offers/quotes-client";
import { EmptyState, GlassCard, PageShell } from "@/components/customers/ui";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Taslak",
  SENT: "Gönderildi",
  VIEWED: "Görüntülendi",
  NEGOTIATION: "Müzakerede",
  WON: "Kazanıldı",
  LOST: "Kaybedildi",
  CANCELLED: "İptal",
};

const STATUS_TONE: Record<QuoteStatus, string> = {
  DRAFT: "bg-white/[0.06] text-[#93a0ad] border-white/10",
  SENT: "bg-[#123b2c] text-[#3ddc97] border-[#3ddc97]/25",
  VIEWED: "bg-[#123b2c] text-[#3ddc97] border-[#3ddc97]/25",
  NEGOTIATION: "bg-[#3b2f14] text-[#f2b53a] border-[#f2b53a]/25",
  WON: "bg-[#123b2c] text-[#3ddc97] border-[#3ddc97]/25",
  LOST: "bg-[#3b1420] text-[#f16a7a] border-[#f16a7a]/25",
  CANCELLED: "bg-[#3b1420] text-[#f16a7a] border-[#f16a7a]/25",
};

export function OffersListScreen() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const res = await listQuotes();
      if (res.ok) {
        setQuotes(res.data.quotes);
        setLoadError(null);
      } else {
        setLoadError(res.error);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <PageShell
      header={
        <header className="py-1">
          <p className="text-lg font-bold text-[#f4f7f8]">Teklifler</p>
          <p className="text-xs text-[#6f7a87]">Müşterilere gönderilen tüm fiyat teklifleri.</p>
        </header>
      }
    >
      {loading ? (
        <p className="mt-8 text-center text-sm text-[#6f7a87]">Teklifler yükleniyor...</p>
      ) : loadError ? (
        <GlassCard className="mt-6 p-6 text-center">
          <p className="text-sm font-semibold text-[#f16a7a]">{loadError}</p>
        </GlassCard>
      ) : quotes.length === 0 ? (
        <EmptyState description="Bir müşteri için teklif hazırlamak üzere METRIX'e söylemen yeterli." title="Henüz teklif yok" />
      ) : (
        <div className="mt-4 space-y-2">
          {quotes.map((quote) => (
            <Link className="block" href={`/metrix/offers/${quote.id}/edit`} key={quote.id}>
              <GlassCard className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#f4f7f8]">{quote.customerName}</p>
                  <p className="truncate text-xs text-[#6f7a87]">{quote.title}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`inline-flex items-center rounded-[3px] border px-[7px] py-[2px] text-[10px] font-semibold ${STATUS_TONE[quote.status]}`}>
                    {STATUS_LABEL[quote.status]}
                  </span>
                  <p className="text-xs font-semibold text-[#f4f7f8]">{quote.amount ? formatTRY(Number(quote.amount) * 100, quote.currency) : "—"}</p>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
