"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";

type OfferStatus = "DRAFT" | "SENT" | "VIEWED" | "NEGOTIATION" | "WON" | "LOST" | "CANCELLED";
type PublicOffer = { id: string; title: string; customerName: string; customerPhone: string | null; amount: string | null; currency: string; status: OfferStatus; customerNote: string | null; specialTerms: string | null; validUntil: string | null; paymentTerm: string | null; deliveryTerm: string | null; deliveryMethod: string | null; organizationName: string; organizationLogoRef: string | null; items: Array<{ id: string; name: string; unit: string | null; quantity: string; unitPriceCents: string; lineTotalCents: string }> };
type ActionMode = "idle" | "approve" | "reject" | "counter";

const money = (value: string | null, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(value ?? 0));
const cents = (value: string, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(value) / 100);
const terminalMessage: Partial<Record<OfferStatus, string>> = { WON: "Bu teklif onaylandı.", LOST: "Bu teklif reddedildi.", CANCELLED: "Bu teklif iptal edildi." };

export function PublicOfferView({ offer, token }: { offer: PublicOffer; token: string }) {
  const [status, setStatus] = useState(offer.status);
  const [mode, setMode] = useState<ActionMode>("idle");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(terminalMessage[offer.status] ?? null);
  const [reason, setReason] = useState("");
  const [counter, setCounter] = useState({ proposedAmount: "", proposedPaymentTerm: "", proposedDeliveryTerm: "", message: "" });

  useEffect(() => {
    void fetch(`/api/public/offers/${encodeURIComponent(token)}/view`, { method: "POST" }).catch(() => undefined);
  }, [token]);

  async function submit(path: string, body?: Record<string, string>) {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/public/offers/${encodeURIComponent(token)}/${path}`, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const payload = await response.json() as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Teklif işlemi tamamlanamadı.");
      return true;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Teklif işlemi tamamlanamadı.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!await submit("approve")) return;
    setStatus("WON"); setMode("idle"); setFeedback("Teklifi onayladığınız için teşekkürler, ekibimiz sizinle iletişime geçecek.");
  }

  async function reject() {
    if (!await submit("reject", { reason })) return;
    setStatus("LOST"); setMode("idle"); setFeedback("Kararınız ekibimize iletildi. Geri bildiriminiz için teşekkürler.");
  }

  async function counterPropose(event: FormEvent) {
    event.preventDefault();
    if (!Object.values(counter).some((value) => value.trim())) { setFeedback("En az bir karşı teklif alanı doldurun."); return; }
    if (!await submit("counter-propose", counter)) return;
    setStatus("NEGOTIATION"); setMode("idle"); setFeedback("Karşı teklifiniz ekibimize iletildi. Sizinle iletişime geçeceğiz.");
  }

  const open = ["SENT", "VIEWED", "NEGOTIATION"].includes(status);
  const inputClass = "w-full rounded-xl border border-[#493d2d] bg-[#12100d] px-4 py-3 text-sm text-[#ede7d9] outline-none focus:border-[#c89b54]";
  return <main className="min-h-screen bg-[#0d0c0a] px-5 py-10 text-[#ede7d9]"><article className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-[#342e25] bg-[#171410] shadow-2xl"><header className="border-b border-[#342e25] px-8 py-9 sm:px-12"><div className="flex items-center gap-4">{offer.organizationLogoRef ? <Image alt={`${offer.organizationName} logosu`} className="max-h-14 max-w-40 object-contain" height={56} src={offer.organizationLogoRef} unoptimized width={160} /> : null}<p className="text-xs font-semibold tracking-[.32em] text-[#c89b54]">{offer.organizationName}</p></div><h1 className="mt-5 text-3xl font-semibold sm:text-5xl">{offer.title}</h1><div className="mt-3 text-[#a69d8d]"><p>{offer.customerName} için hazırlanmıştır.</p>{offer.customerPhone ? <p className="mt-1 text-sm">{offer.customerPhone}</p> : null}</div></header><section className="px-8 py-8 sm:px-12"><div className="overflow-hidden rounded-2xl border border-[#342e25]"><div className="grid grid-cols-[1fr_auto] bg-[#211c16] px-5 py-3 text-xs uppercase tracking-wider text-[#988c79]"><span>Teklif kalemleri</span><span>Tutar</span></div>{offer.items.map((item) => <div className="grid grid-cols-[1fr_auto] gap-6 border-t border-[#342e25] px-5 py-5 first:border-t-0" key={item.id}><div><strong>{item.name}</strong><p className="mt-1 text-sm text-[#928979]">{item.quantity} {item.unit ?? "adet"} × {cents(item.unitPriceCents, offer.currency)}</p></div><strong>{cents(item.lineTotalCents, offer.currency)}</strong></div>)}</div><div className="mt-8 flex items-end justify-between border-t border-[#342e25] pt-7"><span className="text-sm text-[#9e9585]">Toplam teklif</span><strong className="text-3xl text-[#ddb56f]">{money(offer.amount, offer.currency)}</strong></div>{offer.customerNote ? <div className="mt-8 rounded-2xl bg-[#211c16] p-5"><h2 className="text-sm font-semibold">Not</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#bcb3a3]">{offer.customerNote}</p></div> : null}{offer.specialTerms ? <div className="mt-4 rounded-2xl border border-[#493d2d] bg-[#1c1813] p-5"><h2 className="text-sm font-semibold text-[#ddb56f]">Özel Koşullar</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#bcb3a3]">{offer.specialTerms}</p></div> : null}<dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2">{offer.validUntil ? <div><dt className="text-[#887f71]">Geçerlilik tarihi</dt><dd className="mt-1">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(new Date(offer.validUntil))}</dd></div> : null}{offer.paymentTerm ? <div><dt className="text-[#887f71]">Ödeme koşulu</dt><dd className="mt-1">{offer.paymentTerm}</dd></div> : null}{offer.deliveryTerm ? <div><dt className="text-[#887f71]">Teslim koşulu</dt><dd className="mt-1">{offer.deliveryTerm}</dd></div> : null}{offer.deliveryMethod ? <div><dt className="text-[#887f71]">Teslim yöntemi</dt><dd className="mt-1">{offer.deliveryMethod}</dd></div> : null}</dl>

      <div className="mt-10 border-t border-[#342e25] pt-8">
        {feedback ? <p role="status" className="mb-5 rounded-2xl border border-[#5b4930] bg-[#241d14] px-5 py-4 text-sm text-[#e1bf84]">{feedback}</p> : null}
        {open && mode === "idle" ? <div className="grid gap-3 sm:grid-cols-3"><button className="rounded-xl bg-[#d5ad69] px-5 py-3 font-semibold text-[#17120b]" onClick={() => setMode("approve")}>Onayla</button><button className="rounded-xl border border-[#80683f] px-5 py-3 font-semibold" onClick={() => setMode("counter")}>Karşı Teklif Ver</button><button className="rounded-xl border border-[#67413a] px-5 py-3 font-semibold text-[#d5aaa1]" onClick={() => setMode("reject")}>Reddet</button></div> : null}
        {open && mode === "approve" ? <div className="rounded-2xl bg-[#211c16] p-5"><h2 className="font-semibold">Teklifi onaylamak istiyor musunuz?</h2><p className="mt-2 text-sm text-[#aaa08f]">Onayınız ekibimize iletilecek.</p><div className="mt-5 flex gap-3"><button disabled={busy} className="rounded-xl bg-[#d5ad69] px-5 py-3 font-semibold text-[#17120b] disabled:opacity-50" onClick={approve}>Evet, onayla</button><button className="px-4 py-3 text-sm" onClick={() => setMode("idle")}>Vazgeç</button></div></div> : null}
        {open && mode === "reject" ? <div className="rounded-2xl bg-[#211c16] p-5"><label className="text-sm font-semibold" htmlFor="reject-reason">Reddetme nedeni <span className="font-normal text-[#918777]">(opsiyonel)</span></label><textarea id="reject-reason" className={`${inputClass} mt-3 min-h-24`} value={reason} onChange={(event) => setReason(event.target.value)} /><div className="mt-4 flex gap-3"><button disabled={busy} className="rounded-xl bg-[#8b5148] px-5 py-3 font-semibold disabled:opacity-50" onClick={reject}>Reddetmeyi onayla</button><button className="px-4 py-3 text-sm" onClick={() => setMode("idle")}>Vazgeç</button></div></div> : null}
        {open && mode === "counter" ? <form className="grid gap-4 rounded-2xl bg-[#211c16] p-5" onSubmit={counterPropose}><h2 className="text-lg font-semibold">Karşı teklifiniz</h2><label className="text-sm">Önerilen tutar<input aria-label="Önerilen tutar" inputMode="decimal" className={`${inputClass} mt-2`} value={counter.proposedAmount} onChange={(event) => setCounter({ ...counter, proposedAmount: event.target.value })} /></label><label className="text-sm">Ödeme koşulu<input className={`${inputClass} mt-2`} value={counter.proposedPaymentTerm} onChange={(event) => setCounter({ ...counter, proposedPaymentTerm: event.target.value })} /></label><label className="text-sm">Teslim koşulu<input className={`${inputClass} mt-2`} value={counter.proposedDeliveryTerm} onChange={(event) => setCounter({ ...counter, proposedDeliveryTerm: event.target.value })} /></label><label className="text-sm">Mesaj<textarea className={`${inputClass} mt-2 min-h-24`} value={counter.message} onChange={(event) => setCounter({ ...counter, message: event.target.value })} /></label><div className="flex gap-3"><button disabled={busy} className="rounded-xl bg-[#d5ad69] px-5 py-3 font-semibold text-[#17120b] disabled:opacity-50" type="submit">Karşı teklifi gönder</button><button className="px-4 py-3 text-sm" type="button" onClick={() => setMode("idle")}>Vazgeç</button></div></form> : null}
      </div>
    </section></article></main>;
}
