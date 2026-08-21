"use client";

import { useRef, useState } from "react";
import type { CustomerImportField } from "@/lib/imports/customer-header-mapping";

type ImportPreviewRow = {
  rowIndex: number;
  values: Partial<Record<CustomerImportField, string>>;
  duplicates: Array<{ customerId: string; displayName: string; strength: "STRONG" | "WEAK"; matchedFields: string[] }>;
  excluded: boolean;
};

type ParseResponse = {
  mapping: Record<string, CustomerImportField | "unmapped">;
  unmappedHeaders: string[];
  rows: ImportPreviewRow[];
  totalRows: number;
  duplicateCount: number;
};

type CommitResponse = {
  sourceMessageId: string;
  created: number;
  failed: Array<{ rowIndex: number; error: string }>;
};

const FIELD_LABELS: Record<CustomerImportField, string> = {
  displayName: "Müşteri Adı",
  legalName: "Ticari Ünvan",
  taxNumber: "Vergi No",
  taxOffice: "Vergi Dairesi",
  phone: "Telefon",
  email: "E-posta",
  billingAddress: "Adres",
  cariKodu: "Cari Kod",
};

export function CustomerImportWizard() {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ParseResponse | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(file: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/customers/imports/parse", { method: "POST", credentials: "include", body: formData });
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
    try {
      const response = await fetch("/api/customers/imports/commit", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: preview.rows }),
      });
      const json = (await response.json()) as { ok?: boolean; data?: CommitResponse; error?: { message?: string } };
      if (!response.ok || !json.ok || !json.data) {
        setError(json.error?.message ?? "İçe aktarma tamamlanamadı.");
        setBusy(false);
        return;
      }
      setResult(json.data);
      setStep("done");
    } catch {
      setError("Bağlantı kurulamadı.");
    }
    setBusy(false);
  }

  const includedCount = preview?.rows.filter((row) => !row.excluded).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header>
        <p className="text-xs uppercase tracking-[.18em] text-[#7C7466]">Müşteri İçe Aktarma</p>
        <h1 className="mt-1 text-xl font-semibold text-[#EDE7D9]">Excel/CSV&apos;den Müşteri Aktar</h1>
        <p className="mt-1 text-sm text-[#A79F91]">Başka bir programdan (Bizim Hesap, Logo, Mikro, Paraşüt vb.) dışa aktardığınız müşteri listesini yükleyin.</p>
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
            <p>{preview.totalRows} satır bulundu, {includedCount} tanesi içe aktarılacak.</p>
            {preview.duplicateCount ? <p className="mt-1 text-[#f0b429]">{preview.duplicateCount} satır mevcut müşteriyle eşleştiği için otomatik atlandı.</p> : null}
            {preview.unmappedHeaders.length ? <p className="mt-1">Eşleştirilemeyen sütunlar: {preview.unmappedHeaders.join(", ")}</p> : null}
          </div>
          <div className="overflow-x-auto rounded-[20px] border border-white/[.08]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[.03] text-[#7C7466]">
                <tr>
                  <th className="px-3 py-2">Dahil et</th>
                  {(Object.keys(FIELD_LABELS) as CustomerImportField[]).map((field) => <th className="px-3 py-2" key={field}>{FIELD_LABELS[field]}</th>)}
                  <th className="px-3 py-2">Not</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr className={`border-t border-white/[.06] ${row.excluded ? "opacity-40" : ""}`} key={row.rowIndex}>
                    <td className="px-3 py-2"><input checked={!row.excluded} onChange={() => toggleRow(row.rowIndex)} type="checkbox" /></td>
                    {(Object.keys(FIELD_LABELS) as CustomerImportField[]).map((field) => <td className="px-3 py-2 text-[#EDE7D9]" key={field}>{row.values[field] ?? "—"}</td>)}
                    <td className="px-3 py-2">{row.duplicates.length ? <span className="rounded-full border border-[#f0b429]/30 bg-[#f0b429]/10 px-2 py-0.5 text-xs text-[#f0b429]">Olası eşleşme</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-[#C9BFA8]" onClick={() => setStep("upload")} type="button">Farklı dosya seç</button>
            <button className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F] disabled:opacity-40" disabled={busy || includedCount === 0} onClick={() => void commit()} type="button">
              {busy ? "İçe aktarılıyor…" : `${includedCount} Kaydı İçe Aktar`}
            </button>
          </div>
        </section>
      ) : null}

      {step === "done" && result ? (
        <section className="rounded-[20px] border border-[#34e6cf]/20 bg-[#34e6cf]/10 p-6 text-sm text-[#EDE7D9]">
          <p className="font-semibold">{result.created} müşteri kaydı oluşturuldu.</p>
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
