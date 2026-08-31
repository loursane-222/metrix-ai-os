import ExcelJS from "exceljs";
import type { CollectionsDataset } from "../datasets/collections-dataset.service";
import { ARTIFACT_MIME_TYPES, sanitizeArtifactFilenameSegment, type GeneratedArtifactFile } from "../artifact.types";

// Pure rendering: takes the already-resolved canonical dataset and turns it
// into real XLSX bytes. Never queries Prisma, never talks to any business
// authority, never invents a row or a number of its own — see
// collections-dataset.service.ts for where the actual truth comes from
// (Artifact Truth, Phase D1 section 3/4).
export async function renderCollectionsXlsx(dataset: CollectionsDataset): Promise<GeneratedArtifactFile> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "METRIX";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Tahsilatlar", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Tarih", key: "occurredAt", width: 14 },
    { header: "Müşteri", key: "customerName", width: 28 },
    { header: "Açıklama", key: "title", width: 32 },
    { header: "Fatura No", key: "invoiceNumber", width: 16 },
    { header: "Tür", key: "kind", width: 12 },
    { header: "Tutar", key: "amount", width: 16 },
    { header: "Para Birimi", key: "currency", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const record of dataset.records) {
    const row = sheet.addRow({
      occurredAt: record.occurredAt,
      customerName: record.customerName,
      title: record.title,
      invoiceNumber: record.invoiceNumber ?? "",
      kind: record.kind === "REVERSAL" ? "İade/İptal" : "Tahsilat",
      amount: record.amount,
      currency: record.currency,
    });
    row.getCell("occurredAt").numFmt = "yyyy-mm-dd";
    row.getCell("amount").numFmt = "#,##0.00";
  }

  const totalsStartRow = sheet.rowCount + 2;
  sheet.getCell(`A${totalsStartRow}`).value = `Dönem: ${dataset.period.label} (${dataset.period.isoLabel})`;
  sheet.getCell(`A${totalsStartRow}`).font = { italic: true };
  sheet.getCell(`A${totalsStartRow + 1}`).value = "Kayıt sayısı:";
  sheet.getCell(`B${totalsStartRow + 1}`).value = dataset.recordCount;

  let totalRowOffset = 2;
  for (const [currency, total] of Object.entries(dataset.totalsByCurrency)) {
    const rowIndex = totalsStartRow + totalRowOffset;
    sheet.getCell(`A${rowIndex}`).value = `Toplam (${currency}):`;
    sheet.getCell(`A${rowIndex}`).font = { bold: true };
    const totalCell = sheet.getCell(`B${rowIndex}`);
    totalCell.value = total;
    totalCell.numFmt = "#,##0.00";
    totalCell.font = { bold: true };
    totalRowOffset += 1;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `tahsilatlar-${sanitizeArtifactFilenameSegment(dataset.period.isoLabel)}.xlsx`;
  return {
    format: "xlsx",
    filename,
    mimeType: ARTIFACT_MIME_TYPES.xlsx,
    content: Buffer.from(buffer),
  };
}
