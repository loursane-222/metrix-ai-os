"use client";

import { useRef, useState } from "react";
import type { OfferImportField } from "@/lib/imports/offer-header-mapping";
import { chunkRows } from "@/lib/imports/chunk-rows";

type CustomerMatch = { status: "RESOLVED"; customerId: string; customerName: string } | { status: "NOT_FOUND" } | { status: "AMBIGUOUS" };

type ImportPreviewRow = {
  rowIndex: number;
  values: Partial<Record<OfferImportField, string>>;
  customerMatch: CustomerMatch;
  excluded: boolean;
};

type ParseResponse = {
  mapping: Record<string, OfferImportField | "unmapped">;
  unmappedHeaders: string[];
  rows: ImportPreviewRow[];
  totalRows: number;
  unresolvedCustomerCount: number;
  fileHash: string;
  priorImportAt: string | null;
};

type CommitResponse = {
  sourceMessageId: string;
  created: number;
  failed: Array<{ rowIndex: number; error: string }>;
};

const FIELD_LABELS: Record<OfferImportField, string> = {
  customerRef: "Müşteri",
  title: "Açıklama",
  amount: "Tutar",
  currency: "Para Birimi",
};

function matchNote(match: CustomerMatch): string | null {
  if (match.status === "NOT_FOUND") return "Müşteri bulunamadı";
  if (match.status === "AMBIGUOUS") return "Birden çok müşteriyle eşleşti";
  return null;
}

// A large import sent as one request can outrun Vercel's 60s function
// ceiling regardless of backend throughput. Splitting the commit into
// fixed-size pages sent as separate sequential requests removes that
// dependency entirely — see CustomerImportWizard.tsx for the original fix.
const CHUNK_SIZE = 40;

export function OfferImportWizard() {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ParseResponse | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(file: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/offers/imports/parse", { method: "POST", credentials: "include", body: formData });
      const json = (await response.json()) as { ok?: boolean; data?: ParseResponse; error?: { message?: string } };
      if (!response.ok || !json.ok || !json.data) {
        setError(json.error?.message ?? "Dosya işlenemedi.");
        setBusy(false);
        return;
      }
      setPreview(json.data);
      setStep("preview");
    } catch {
      setError("Bağlantı kurulamadı.");
    }
    setBusy(false);
  }

  function toggleRow(rowIndex: number) {
    setPreview((current) => current && { ...current, rows: current.rows.map((row) => (row.rowIndex === rowIndex ? { ...row, excluded: !row.excluded } : row)) });
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);

    const rows = preview.rows.filter((row) => !row.excluded && row.customerMatch.status === "RESOLVED");
    const chunks = chunkRows(rows, CHUNK_SIZE);

    let sourceMessageId = "";
    let created = 0;
    const failed: CommitResponse["failed"] = [];
    setProgress({ done: 0, total: rows.length });

    for (const chunk of chunks) {
      try {
        const response = await fetch("/api/offers/imports/commit", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rows: chunk, fileHash: preview.fileHash }),
        });
        const json = (await response.json()) as { ok?: boolean; data?: CommitResponse; error?: { message?: string } };
        if (!response.ok || !json.ok || !json.data) {
          failed.push(...chunk.map((row) => ({ rowIndex: row.rowIndex, error: json.error?.message ?? "İçe aktarma tamamlanamadı." })));
          break;
        }
        sourceMessageId = json.data.sourceMessageId || sourceMessageId;
        created += json.data.created;
        failed.push(...json.data.failed);
      } catch {
        failed.push(...chunk.map((row) => ({ rowIndex: row.rowIndex, error: "Bağlantı kurulamadı." })));
        break;
      }
      setProgress((current) => (current ? { done: current.done + chunk.length, total: current.total } : current));
    }

    setProgress(null);
    setResult({ sourceMessageId, created, failed });
    setStep("done");
    setBusy(false);
  }

  const includedRows = preview?.rows.filter((row) => !row.excluded && row.customerMatch.status === "RESOLVED") ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6" data-import-wizard-v1>
      <header>
        <p className="text-xs uppercase tracking-[.18em] text-[#7C7466]">Teklif İçe Aktarma</p>
        <h1 className="mt-1 text-xl font-semibold text-[#EDE7D9]">Excel/CSV&apos;den Teklif Aktar</h1>
        <p className="mt-1 text-sm text-[#A79F91]">Başka bir programdan (Bizim Hesap, Logo, Mikro, Paraşüt vb.) dışa aktardığınız teklif listesini yükleyin.</p>
        <p className="mt-1 text-sm text-[#A79F91]">Her satırın &quot;Müşteri&quot; sütunu, sistemde kayıtlı bir müşteriyle eşleşmelidir — eşleşmeyen satırlar otomatik atlanır.</p>
      </header>

      {error ? <p className="rounded-xl border border-[#f16a7a]/20 bg-[#f16a7a]/10 p-3 text-sm text-[#f16a7a]" role="alert">{error}</p> : null}

      {step === "upload" ? (
        <section className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-6 text-center">
          <input
            accept=".xlsx,.csv"
            aria-describedby="import-file-contract"
            className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFileSelected(file); }}
            ref={fileInputRef}
            type="file"
          />
          <p data-import-file-contract id="import-file-contract">Excel (.xlsx) veya CSV · maksimum 10 MB</p>
          <button
            className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F] disabled:opacity-40"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {busy ? "Yükleniyor…" : "Dosya Seç (.xlsx / .csv)"}
          </button>
        </section>
      ) : null}

      {step === "preview" && preview ? (
        <section className="space-y-4">
          {preview.priorImportAt ? (
            <p className="rounded-xl border border-[#f0b429]/30 bg-[#f0b429]/10 p-3 text-sm text-[#f0b429]" role="alert">
              Bu dosyayı {new Date(preview.priorImportAt).toLocaleString("tr-TR")} tarihinde zaten içe aktarmışsınız gibi görünüyor. Yine de devam edebilirsiniz.
            </p>
          ) : null}
          <div className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-4 text-sm text-[#A79F91]">
            <p>{preview.totalRows} satır bulundu, {includedRows.length} tanesi içe aktarılacak.</p>
            {preview.unresolvedCustomerCount ? <p className="mt-1 text-[#f0b429]">{preview.unresolvedCustomerCount} satır müşteri eşleşmediği için atlandı.</p> : null}
            {preview.unmappedHeaders.length ? <p className="mt-1">Eşleştirilemeyen sütunlar: {preview.unmappedHeaders.join(", ")}</p> : null}
          </div>
          <div className="overflow-x-auto rounded-[20px] border border-white/[.08]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[.03] text-[#7C7466]">
                <tr>
                  <th className="px-3 py-2">Dahil et</th>
                  {(Object.keys(FIELD_LABELS) as OfferImportField[]).map((field) => <th className="px-3 py-2" key={field}>{FIELD_LABELS[field]}</th>)}
                  <th className="px-3 py-2">Not</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const note = matchNote(row.customerMatch);
                  return (
                    <tr className={`border-t border-white/[.06] ${row.excluded || note ? "opacity-40" : ""}`} key={row.rowIndex}>
                      <td className="px-3 py-2"><input checked={!row.excluded && row.customerMatch.status === "RESOLVED"} disabled={row.customerMatch.status !== "RESOLVED"} onChange={() => toggleRow(row.rowIndex)} type="checkbox" /></td>
                      {(Object.keys(FIELD_LABELS) as OfferImportField[]).map((field) => <td className="px-3 py-2 text-[#EDE7D9]" key={field}>{field === "customerRef" && row.customerMatch.status === "RESOLVED" ? row.customerMatch.customerName : row.values[field] ?? "—"}</td>)}
                      <td className="px-3 py-2">{note ? <span className="rounded-full border border-[#f0b429]/30 bg-[#f0b429]/10 px-2 py-0.5 text-xs text-[#f0b429]">{note}</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-[#C9BFA8]" onClick={() => setStep("upload")} type="button">Farklı dosya seç</button>
            <button className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F] disabled:opacity-40" disabled={busy || includedRows.length === 0} onClick={() => void commit()} type="button">
              {busy ? (progress ? `İçe aktarılıyor… (${progress.done}/${progress.total})` : "İçe aktarılıyor…") : `${includedRows.length} Kaydı İçe Aktar`}
            </button>
          </div>
        </section>
      ) : null}

      {step === "done" && result ? (
        <section className="rounded-[20px] border border-[#34e6cf]/20 bg-[#34e6cf]/10 p-6 text-sm text-[#EDE7D9]">
          <p className="font-semibold">{result.created} teklif kaydı oluşturuldu.</p>
          {result.failed.length ? (
            <div className="mt-3">
              <p className="text-[#f16a7a]">{result.failed.length} satır işlenemedi:</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-[#A79F91]">
                {result.failed.map((failure) => <li key={failure.rowIndex}>Satır {failure.rowIndex + 2}: {failure.error}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
