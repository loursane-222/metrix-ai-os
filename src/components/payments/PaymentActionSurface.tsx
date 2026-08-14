"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ExecutiveStroke, PendingWorkRail } from "@/components/executive-signatures/SignatureComponents";
import { cancelPaymentApplyAction, confirmPaymentApplyAction, listPayments, requestPaymentApplyAction, type PaymentRecord } from "@/lib/payments/payments-client";
import type { PaymentEditCommandExecutionResult } from "@/lib/payments/payment-edit-command-contract";
import { registerPaymentEditSurfaceTarget, unregisterPaymentEditSurfaceTarget } from "@/lib/payments/payment-edit-surface-command-channel";

const STATUS: Record<string, string> = { PENDING: "Bekliyor", PARTIAL: "Kısmi Ödendi", PARTIALLY_PAID: "Kısmi Ödendi", PAID: "Ödendi", OVERDUE: "Gecikti", CANCELLED: "İptal" };
type PaymentView = PaymentRecord & { invoiceNumber?: string | null; invoiceTitle?: string | null };

export function PaymentActionSurface({ paymentId, onReady, onFailure }: { paymentId: string; onReady?: () => void; onFailure?: () => void }) {
  const [payment, setPayment] = useState<PaymentView | null>(null); const [amount, setAmount] = useState("");
  const [approval, setApproval] = useState<{ approvalId: string; amount: number } | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { const result = await listPayments(); if (!result.ok) { setError(result.error); onFailure?.(); return; } const match = result.data.payments.find((record) => record.id === paymentId) as PaymentView | undefined; if (!match) { setError("Tahsilat bulunamadı."); onFailure?.(); return; } setPayment(match); setAmount(String(remainingAmount(match))); setError(null); onReady?.(); }, [onFailure, onReady, paymentId]);
  useEffect(() => { void load(); }, [load]);
  const requestAmountApproval = useCallback(async (value: number): Promise<string | null> => { setBusy(true); setError(null); const result = await requestPaymentApplyAction(paymentId, value); setBusy(false); if (result.ok) { setApproval({ approvalId: result.data.approval.approvalId, amount: value }); return null; } setError(result.error); return result.error; }, [paymentId]);
  async function requestApproval(event: FormEvent) { event.preventDefault(); await requestAmountApproval(Number(amount.replace(",", "."))); }
  useEffect(() => { const runtime = { getState: () => ({ activeTab: "actions" as const }), applyCommand: async (command: { type: "apply"; amount: number }): Promise<PaymentEditCommandExecutionResult> => { const commandError = await requestAmountApproval(command.amount); return commandError ? { status: "EXECUTION_FAILED", error: commandError } : { status: "EXECUTED", command }; } }; const token = registerPaymentEditSurfaceTarget({ entityId: paymentId, runtime }); return () => unregisterPaymentEditSurfaceTarget(token); }, [paymentId, requestAmountApproval]);
  async function confirm() { if (!approval) return; setBusy(true); setError(null); const result = await confirmPaymentApplyAction(paymentId, approval.approvalId, approval.amount); if (result.ok) { setApproval(null); await load(); } else setError(result.error); setBusy(false); }
  async function cancel() { if (!approval) return; setBusy(true); setError(null); const result = await cancelPaymentApplyAction(paymentId, approval.approvalId); if (result.ok) setApproval(null); else setError(result.error); setBusy(false); }
  if (!payment && !error) return <p className="py-12 text-center text-sm text-[#7C7466]">Tahsilat yükleniyor…</p>;
  if (!payment) return <Message error={error ?? "Tahsilat bulunamadı."}/>;
  const remaining = remainingAmount(payment); const actionable = payment.status !== "PAID" && payment.status !== "CANCELLED";
  return <div className="mx-auto max-w-5xl space-y-4 pb-8" data-payment-action-surface={payment.id}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.18em] text-[#7C7466]">Tahsilat çalışma alanı</p><h2 className="mt-1 text-xl font-semibold text-[#EDE7D9]">{payment.title}</h2><p className="mt-1 text-sm text-[#A79F91]">{payment.customerId ? `Müşteri kaydı · ${payment.customerId}` : "Müşteri belirtilmemiş"}</p></div><Badge>{STATUS[payment.status] ?? payment.status}</Badge></header>
    {error ? <Message error={error}/> : null}
    <Card title="Tahsilat bilgileri"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Fact label="Tutar" value={money(payment.amount, payment.currency)}/><Fact label="Tahsil edilen" value={money(payment.paidAmount, payment.currency)}/><Fact label="Kalan bakiye" value={money(String(remaining), payment.currency)}/><Fact label="Para birimi" value={payment.currency}/><Fact label="Vade tarihi" value={formatDate(payment.dueDate)}/><Fact label="Fatura referansı" value={payment.invoiceNumber ? `${payment.invoiceNumber}${payment.invoiceTitle ? ` · ${payment.invoiceTitle}` : ""}` : "Faturaya bağlı değil"}/></dl></Card>
    <Card title="Tahsilat kaydet">{approval ? <PendingWorkRail work={{ title: "Tahsilat onayı bekliyor", nextStep: `${money(String(approval.amount), payment.currency)} tahsilat olarak kaydedilecek`, onPrimary: () => void confirm(), onCancel: () => void cancel(), primaryContent: <ExecutiveStroke label={busy ? "İşleniyor…" : "Tahsilatı Kesinleştir"} onCommit={() => void confirm()} onCancel={() => void cancel()}/> }}/>: actionable ? <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void requestApproval(event)}><Field label="Tahsil edilen tutar"><input aria-label="Tahsil edilen tutar" className="w-full rounded-xl border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-[#EDE7D9] outline-none focus:border-[#34e6cf]/45" inputMode="decimal" max={remaining} min="0.01" required step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)}/></Field><Action disabled={busy || !amount}>{busy ? "Hazırlanıyor…" : "Tahsilatı onaya gönder"}</Action></form> : <p className="text-sm text-[#7C7466]">Bu tahsilatta kaydedilebilecek başka tutar yok.</p>}</Card>
  </div>;
}

function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-4"><h3 className="mb-3 text-sm font-semibold text-[#EDE7D9]">{title}</h3>{children}</section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block flex-1 text-xs font-medium text-[#A79F91]"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-[#A79F91]">{label}</dt><dd className="mt-1.5 break-words text-sm text-[#EDE7D9]">{value}</dd></div>; }
function Action({ children, disabled }: { children: ReactNode; disabled: boolean }) { return <button className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F] disabled:opacity-40" disabled={disabled} type="submit">{children}</button>; }
function Badge({ children }: { children: ReactNode }) { return <span className="rounded-full border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-3 py-1.5 text-xs font-semibold text-[#C9BFA8]">{children}</span>; }
function Message({ error }: { error: string }) { return <p className="rounded-xl border border-[#f16a7a]/20 bg-[#f16a7a]/10 p-3 text-sm text-[#f16a7a]" role="alert">{error}</p>; }
function remainingAmount(payment: Pick<PaymentRecord, "amount" | "paidAmount">) { return Math.max(Number(payment.amount) - Number(payment.paidAmount), 0); }
function money(value: string, currency: string) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(value)); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value)) : "Vade tanımlanmamış"; }
