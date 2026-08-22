"use client";

import { useRef, useState } from "react";
import type { StockImportField } from "@/lib/imports/stock-header-mapping";
import { chunkRows } from "@/lib/imports/chunk-rows";

type Match = { status: "RESOLVED"; id: string; label: string } | { status: "NOT_FOUND" } | { status: "AMBIGUOUS" } | { status: "MISSING_MULTIPLE_WAREHOUSES" };

type ImportPreviewRow = {
  rowIndex: number;
  values: Partial<Record<StockImportField, string>>;
  productMatch: Match;
  warehouseMatch: Match;
  excluded: boolean;
};

type ParseResponse = {
  mapping: Record<string, StockImportField | "unmapped">;
  unmappedHeaders: string[];
  rows: ImportPreviewRow[];
  totalRows: number;
  unresolvedCount: number;
};

type CommitResponse = {
  sourceMessageId: string;
  created: number;
  failed: Array<{ rowIndex: number; error: string }>;
};

const FIELD_LABELS: Record<StockImportField, string> = {
  productRef: "Ürün",
  warehouseRef: "Depo",
  quantity: "Miktar",
  lot: "Lot",
  batch: "Parti",
  serialNumber: "Seri No",
  location: "Konum",
};

function matchNote(product: Match, warehouse: Match): string | null {
  if (product.status === "NOT_FOUND") return "Ürün bulunamadı";
  if (product.status === "AMBIGUOUS") return "Ürün birden çok kayıtla eşleşti";
  if (warehouse.status === "MISSING_MULTIPLE_WAREHOUSES") return "Birden fazla depo var, depo sütunu gerekli";
  if (warehouse.status === "NOT_FOUND") return "Depo bulunamadı";
  if (warehouse.status === "AMBIGUOUS") return "Depo birden çok kayıtla eşleşti";
  return null;
}

// A large import sent as one request can outrun Vercel's 60s function
// ceiling regardless of backend throughput. Splitting the commit into
// fixed-size pages sent as separate sequential requests removes that
// dependency entirely — see CustomerImportWizard.tsx for the original fix.
const CHUNK_SIZE = 40;

export function StockImportWizard() {
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
      const response = await fetch("/api/stock/imports/parse", { method: "POST", credentials: "include", body: formData });
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

    const rows = preview.rows.filter((row) => !row.excluded && row.productMatch.status === "RESOLVED" && row.warehouseMatch.status === "RESOLVED");
    const chunks = chunkRows(rows, CHUNK_SIZE);

    let sourceMessageId = "";
    let created = 0;
    const failed: CommitResponse["failed"] = [];
    setProgress({ done: 0, total: rows.length });

    for (const chunk of chunks) {
      try {
        const response = await fetch("/api/stock/imports/commit", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rows: chunk }),
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

  const includedRows = preview?.rows.filter((row) => !row.excluded && row.productMatch.status === "RESOLVED" && row.warehouseMatch.status === "RESOLVED") ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header>
        <p className="text-xs uppercase tracking-[.18em] text-[#7C7466]">Stok İçe Aktarma</p>
        <h1 className="mt-1 text-xl font-semibold text-[#EDE7D9]">Excel/CSV&apos;den Stok Aktar</h1>
        <p className="mt-1 text-sm text-[#A79F91]">Başka bir programdan (Bizim Hesap, Logo, Mikro, Paraşüt vb.) dışa aktardığınız güncel stok listesini yükleyin — her satır bir mal kabul kaydı olarak işlenir.</p>
        <p className="mt-1 text-sm text-[#A79F91]">Her satırın &quot;Ürün&quot; sütunu, sistemde kayıtlı bir ürünle eşleşmelidir. Tek deponuz varsa &quot;Depo&quot; sütunu zorunlu değil.</p>
      </header>

      {error ? <p className="rounded-xl border border-[#f16a7a]/20 bg-[#f16a7a]/10 p-3 text-sm text-[#f16a7a]" role="alert">{error}</p> : null}

      {step === "upload" ? (
        <section className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-6 text-center">
          <input
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFileSelected(file); }}
            ref={fileInputRef}
            type="file"
          />
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
          <div className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-4 text-sm text-[#A79F91]">
            <p>{preview.totalRows} satır bulundu, {includedRows.length} tanesi içe aktarılacak.</p>
            {preview.unresolvedCount ? <p className="mt-1 text-[#f0b429]">{preview.unresolvedCount} satır ürün/depo eşleşmediği için atlandı.</p> : null}
            {preview.unmappedHeaders.length ? <p className="mt-1">Eşleştirilemeyen sütunlar: {preview.unmappedHeaders.join(", ")}</p> : null}
          </div>
          <div className="overflow-x-auto rounded-[20px] border border-white/[.08]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[.03] text-[#7C7466]">
                <tr>
                  <th className="px-3 py-2">Dahil et</th>
                  {(Object.keys(FIELD_LABELS) as StockImportField[]).map((field) => <th className="px-3 py-2" key={field}>{FIELD_LABELS[field]}</th>)}
                  <th className="px-3 py-2">Not</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const note = matchNote(row.productMatch, row.warehouseMatch);
                  const canInclude = row.productMatch.status === "RESOLVED" && row.warehouseMatch.status === "RESOLVED";
                  return (
                    <tr className={`border-t border-white/[.06] ${row.excluded || note ? "opacity-40" : ""}`} key={row.rowIndex}>
                      <td className="px-3 py-2"><input checked={!row.excluded && canInclude} disabled={!canInclude} onChange={() => toggleRow(row.rowIndex)} type="checkbox" /></td>
                      {(Object.keys(FIELD_LABELS) as StockImportField[]).map((field) => {
                        if (field === "productRef") return <td className="px-3 py-2 text-[#EDE7D9]" key={field}>{row.productMatch.status === "RESOLVED" ? row.productMatch.label : row.values[field] ?? "—"}</td>;
                        if (field === "warehouseRef") return <td className="px-3 py-2 text-[#EDE7D9]" key={field}>{row.warehouseMatch.status === "RESOLVED" ? row.warehouseMatch.label : row.values[field] ?? "—"}</td>;
                        return <td className="px-3 py-2 text-[#EDE7D9]" key={field}>{row.values[field] ?? "—"}</td>;
                      })}
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
          <p className="font-semibold">{result.created} stok kaydı işlendi.</p>
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
