import PDFDocument from "pdfkit";
import { LIBERATION_SANS_BOLD_BASE64, LIBERATION_SANS_REGULAR_BASE64 } from "../assets/fonts/liberation-sans.base64";
import type { CollectionsDataset } from "../datasets/collections-dataset.service";
import { ARTIFACT_MIME_TYPES, sanitizeArtifactFilenameSegment, type GeneratedArtifactFile } from "../artifact.types";

// Same canonical dataset as the XLSX/DOCX renderers — this file only lays
// it out as a PDF page stream. No business query, no invented row/total
// (Phase D2, section 7). Server-side, pure-Node generation (pdfkit) —
// deliberately not an HTML→browser→screenshot pipeline (section 6).
//
// pdfkit's built-in "Helvetica" is one of the PDF spec's base-14 fonts,
// restricted to WinAnsiEncoding — it silently drops/mangles Turkish
// characters (ğ, ı, ş, İ) that fall outside that encoding (confirmed live:
// "Ağustos" round-tripped as garbage through a real PDF-text-extraction
// read-back). Liberation Sans (SIL OFL-licensed — see assets/fonts/LICENSE)
// is a full Latin Extended-A font, embedded as base64 (not a filesystem
// path — verified a raw fs path does NOT survive this project's production
// build, no .ttf ends up under .next/) so every generated PDF is
// self-contained regardless of deploy-target file tracing.
const REGULAR_FONT = Buffer.from(LIBERATION_SANS_REGULAR_BASE64, "base64");
const BOLD_FONT = Buffer.from(LIBERATION_SANS_BOLD_BASE64, "base64");

const COLUMNS = [
  { label: "Tarih", width: 65 },
  { label: "Müşteri", width: 110 },
  { label: "Açıklama", width: 115 },
  { label: "Tür", width: 60 },
  { label: "Tutar", width: 70 },
  { label: "P.B.", width: 40 },
] as const;
const ROW_HEIGHT = 18;

export async function renderCollectionsPdf(dataset: CollectionsDataset): Promise<GeneratedArtifactFile> {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font(BOLD_FONT).fontSize(18).text("Tahsilat Raporu");
  doc.moveDown(0.5);
  doc.font(REGULAR_FONT).fontSize(11);
  doc.text(`Dönem: ${dataset.period.label} (${dataset.period.isoLabel})`);
  doc.text(`Kayıt sayısı: ${dataset.recordCount}`);
  for (const [currency, total] of Object.entries(dataset.totalsByCurrency)) {
    doc.text(`Toplam (${currency}): ${total.toFixed(2)}`);
  }
  doc.moveDown(1);

  const startX = doc.page.margins.left;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  let y = doc.y;

  function drawRow(cells: readonly string[], bold: boolean): void {
    if (y + ROW_HEIGHT > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    let x = startX;
    doc.font(bold ? BOLD_FONT : REGULAR_FONT).fontSize(9);
    for (let i = 0; i < COLUMNS.length; i++) {
      doc.text(cells[i] ?? "", x, y, { width: COLUMNS[i]!.width, ellipsis: true });
      x += COLUMNS[i]!.width;
    }
    y += ROW_HEIGHT;
  }

  drawRow(COLUMNS.map((c) => c.label), true);
  if (dataset.records.length === 0) {
    doc.font(REGULAR_FONT).fontSize(10).text("Bu dönem için kayıtlı tahsilat yok.", startX, y + 4);
  }
  for (const record of dataset.records) {
    drawRow(
      [
        record.occurredAt.toISOString().slice(0, 10),
        record.customerName,
        record.title,
        record.kind === "REVERSAL" ? "İade" : "Tahsilat",
        record.amount.toFixed(2),
        record.currency,
      ],
      false,
    );
  }

  doc.end();
  const buffer = await finished;
  const filename = `tahsilatlar-${sanitizeArtifactFilenameSegment(dataset.period.isoLabel)}.pdf`;
  return {
    format: "pdf",
    filename,
    mimeType: ARTIFACT_MIME_TYPES.pdf,
    content: buffer,
  };
}
