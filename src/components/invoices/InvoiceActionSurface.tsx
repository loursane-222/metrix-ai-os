"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { executeInvoiceSendAction, listInvoices, type InvoiceRecord } from "@/lib/invoices/invoices-client";
import type { InvoiceEditCommandExecutionResult } from "@/lib/invoices/invoice-edit-command-contract";
import { registerInvoiceEditSurfaceTarget, unregisterInvoiceEditSurfaceTarget } from "@/lib/invoices/invoice-edit-surface-command-channel";

const STATUS: Record<string, string> = { DRAFT: "Taslak", SENT: "Gönderildi", PAID: "Ödendi", CANCELLED: "İptal" };
type InvoiceView = InvoiceRecord & { paymentReferences?: string | null };

export function InvoiceActionSurface({ invoiceId, onReady, onFailure }: { invoiceId: string; onReady?: () => void; onFailure?: () => void }) {
  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await listInvoices();
    if (!result.ok) { setError(result.error); onFailure?.(); return; }
    const match = result.data.invoices.find((record) => record.id === invoiceId) as InvoiceView | undefined;
    if (!match) { setError("Fatura bulunamadı."); onFailure?.(); return; }
    setInvoice(match); setError(null); onReady?.();
  }, [invoiceId, onFailure, onReady]);
  useEffect(() => { void load(); }, [load]);
  const send = useCallback(async (): Promise<string | null> => { setBusy(true); setError(null); const result = await executeInvoiceSendAction(invoiceId); if (result.ok) { await load(); setBusy(false); return null; } setError(result.error); setBusy(false); return result.error; }, [invoiceId, load]);
  useEffect(() => {
    const runtime = { getState: () => ({ activeTab: "actions" as const }), applyCommand: async (): Promise<InvoiceEditCommandExecutionResult> => { const commandError = await send(); return commandError ? { status: "EXECUTION_FAILED", error: commandError } : { status: "EXECUTED", command: { type: "send" } }; } };
    const token = registerInvoiceEditSurfaceTarget({ entityId: invoiceId, runtime });
    return () => unregisterInvoiceEditSurfaceTarget(token);
  }, [invoiceId, send]);
  if (!invoice && !error) return <p className="py-12 text-center text-sm text-[#7C7466]">Fatura yükleniyor…</p>;
  if (!invoice) return <Message error={error ?? "Fatura bulunamadı."} />;
  return <div className="mx-auto max-w-5xl space-y-4 pb-8" data-invoice-action-surface={invoice.id}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.18em] text-[#7C7466]">Fatura çalışma alanı</p><h2 className="mt-1 text-xl font-semibold text-[#EDE7D9]">{invoice.invoiceNumber}</h2><p className="mt-1 text-sm text-[#A79F91]">{invoice.title}</p></div><Badge>{STATUS[invoice.status] ?? invoice.status}</Badge></header>
    {error ? <Message error={error} /> : null}
    <Card title="Fatura bilgileri"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Fact label="Müşteri" value={invoice.customerId ? `Müşteri kaydı · ${invoice.customerId}` : "Belirtilmemiş"}/><Fact label="Tutar" value={money(invoice.amount, invoice.currency)}/><Fact label="Vergi" value={`${money(invoice.taxAmount, invoice.currency)} · %${formatNumber(invoice.taxRate)}`}/><Fact label="Toplam" value={money(invoice.totalAmount, invoice.currency)}/><Fact label="Vade tarihi" value={formatDate(invoice.dueDate)}/><Fact label="Ödeme referansları" value={invoice.paymentReferences ?? "Henüz ödeme yok"}/></dl></Card>
    <Card title="Fatura aksiyonları">{invoice.status === "DRAFT" ? <Action disabled={busy} onClick={() => void send()}>{busy ? "Gönderiliyor…" : "Faturayı Gönder"}</Action> : <p className="text-sm text-[#7C7466]">Bu faturada başka aksiyon yok.</p>}</Card>
  </div>;
}

function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-4"><h3 className="mb-3 text-sm font-semibold text-[#EDE7D9]">{title}</h3>{children}</section>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-[#A79F91]">{label}</dt><dd className="mt-1.5 break-words text-sm text-[#EDE7D9]">{value}</dd></div>; }
function Action({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) { return <button className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F] disabled:opacity-40" disabled={disabled} onClick={onClick} type="button">{children}</button>; }
function Badge({ children }: { children: ReactNode }) { return <span className="rounded-full border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-3 py-1.5 text-xs font-semibold text-[#C9BFA8]">{children}</span>; }
function Message({ error }: { error: string }) { return <p className="rounded-xl border border-[#f16a7a]/20 bg-[#f16a7a]/10 p-3 text-sm text-[#f16a7a]" role="alert">{error}</p>; }
function money(value: string, currency: string) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(value)); }
function formatNumber(value: string) { return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(value)); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value)) : "Vade tanımlanmamış"; }
