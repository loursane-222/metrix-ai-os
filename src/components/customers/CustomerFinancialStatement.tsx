"use client";

import { useEffect, useState } from "react";
import { getCustomerStatement, type CustomerStatement } from "@/lib/customers/customers-client";
import { EmptyState, GlassCard, SectionTitle } from "./ui";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; statement: CustomerStatement };

export function CustomerFinancialStatement({ customerId }: { customerId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void getCustomerStatement(customerId).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: "ready", statement: result.data.statement } : { status: "error", message: result.error });
    });
    return () => { cancelled = true; };
  }, [customerId]);

  if (state.status === "loading") return <GlassCard className="p-5"><p className="text-center text-sm text-[#6f7a87]">Cari hesap yükleniyor...</p></GlassCard>;
  if (state.status === "error") return <GlassCard><EmptyState title="Cari hesap alınamadı" description={state.message}/></GlassCard>;
  const { statement } = state;
  if (!statement.movements.length) return <GlassCard><EmptyState title="Kayıt bulunamadı" description="Bu müşteriye bağlı fatura veya tahsilat hareketi yok."/></GlassCard>;

  return <div className="space-y-4">
    <GlassCard className="p-4">
      <SectionTitle>Güncel Cari Bakiye</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {statement.balances.map((balance) => <span className="rounded-xl border border-[#34e6cf]/20 bg-[#34e6cf]/[.08] px-3 py-2 text-sm font-bold text-[#7ef9e8]" key={balance.currency}>{money(balance.balanceCents, balance.currency)}</span>)}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[#6f7a87]">{statement.sourceCounts.invoices} fatura · {statement.sourceCounts.payments} tahsilat · {statement.sourceCounts.ledgerEntries} defter kaydı</p>
      {statement.dataQualityNote ? <p className="mt-3 rounded-xl border border-[#ffb066]/20 bg-[#ffb066]/[.07] px-3 py-2 text-[11px] leading-5 text-[#d9b98d]">{statement.dataQualityNote}</p> : null}
    </GlassCard>
    <div>
      <SectionTitle>Cari Hesap Ekstresi</SectionTitle>
      <div className="space-y-2.5">
        {statement.movements.map((movement) => <GlassCard className="p-4" key={movement.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${movement.sourceType === "INVOICE" ? "bg-[#5b8fff]/15 text-[#8daeff]" : "bg-[#3ddc97]/15 text-[#64e6aa]"}`}>{movement.sourceType === "INVOICE" ? "FATURA" : "TAHSİLAT"}</span><span className="text-[10px] text-[#6f7a87]">{formatDate(movement.date)}</span></div>
              <p className="mt-1.5 truncate text-sm font-semibold text-[#e3e8eb]">{movement.title}</p>
              <p className="mt-1 text-[10px] text-[#6f7a87]">Durum: {movement.status}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-sm font-bold ${BigInt(movement.balanceDeltaCents) > BigInt(0) ? "text-[#ffb066]" : BigInt(movement.balanceDeltaCents) < BigInt(0) ? "text-[#64e6aa]" : "text-[#93a0ad]"}`}>{signedMoney(movement.balanceDeltaCents, movement.currency)}</p>
              <p className="mt-1 text-[10px] text-[#6f7a87]">Bakiye {money(movement.runningBalanceCents, movement.currency)}</p>
            </div>
          </div>
          {movement.ledgerMissing
            ? <p className="mt-3 border-t border-white/[.05] pt-2 text-[10px] leading-4 text-[#9b846a]">Defter kaydı yok — hareket Faz 2 öncesinde oluşmuş olabilir; bakiye canonical kayıttan hesaplandı.</p>
            : movement.ledgerEntries.length
              ? <details className="mt-3 border-t border-white/[.05] pt-2"><summary className="cursor-pointer text-[10px] font-semibold text-[#7b8b94]">Defter kaydı ({movement.ledgerEntries.length})</summary><div className="mt-2 space-y-2">{movement.ledgerEntries.map((entry) => <div className="rounded-xl bg-white/[.025] p-2.5" key={entry.id}><p className="text-[10px] font-semibold text-[#9aa7b0]">{entry.description}{entry.reversalOfId ? " · Ters kayıt" : ""}</p>{entry.lines.map((line, index) => <div className="mt-1 flex justify-between gap-2 text-[9px] text-[#6f7a87]" key={`${entry.id}:${line.accountCode}:${index}`}><span>{line.accountCode} {line.accountName}</span><span>{BigInt(line.debitCents) > BigInt(0) ? `Borç ${money(line.debitCents, line.currency)}` : `Alacak ${money(line.creditCents, line.currency)}`}</span></div>)}</div>)}</div></details>
              : <p className="mt-3 border-t border-white/[.05] pt-2 text-[10px] leading-4 text-[#6f7a87]">Bu durum cari bakiyeyi etkilemediği için defter hareketi oluşmaz.</p>}
        </GlassCard>)}
      </div>
    </div>
  </div>;
}

function money(cents: string, currency: string) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(cents) / 100); }
function signedMoney(cents: string, currency: string) { const amount = BigInt(cents); return `${amount > BigInt(0) ? "+" : ""}${money(cents, currency)}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
