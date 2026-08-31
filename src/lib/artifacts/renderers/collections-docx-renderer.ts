import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { CollectionsDataset } from "../datasets/collections-dataset.service";
import { ARTIFACT_MIME_TYPES, sanitizeArtifactFilenameSegment, type GeneratedArtifactFile } from "../artifact.types";

// Same canonical dataset as the XLSX renderer (collections-xlsx-renderer.ts)
// — this file only reshapes it into OOXML WordprocessingML. It never
// queries Prisma/any business authority, never invents a row/total of its
// own (Phase D2, section 7).
function headerCell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] });
}

function dataCell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph(text)] });
}

export async function renderCollectionsDocx(dataset: CollectionsDataset): Promise<GeneratedArtifactFile> {
  const headerRow = new TableRow({
    children: ["Tarih", "Müşteri", "Açıklama", "Fatura No", "Tür", "Tutar", "Para Birimi"].map(headerCell),
  });

  const dataRows = dataset.records.map((record) =>
    new TableRow({
      children: [
        record.occurredAt.toISOString().slice(0, 10),
        record.customerName,
        record.title,
        record.invoiceNumber ?? "",
        record.kind === "REVERSAL" ? "İade/İptal" : "Tahsilat",
        record.amount.toFixed(2),
        record.currency,
      ].map(dataCell),
    }),
  );

  const totalsParagraphs = Object.entries(dataset.totalsByCurrency).map(
    ([currency, total]) =>
      new Paragraph({ children: [new TextRun({ text: `Toplam (${currency}): ${total.toFixed(2)}`, bold: true })] }),
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Tahsilat Raporu", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `Dönem: ${dataset.period.label} (${dataset.period.isoLabel})`, alignment: AlignmentType.LEFT }),
          new Paragraph({ text: `Kayıt sayısı: ${dataset.recordCount}` }),
          ...totalsParagraphs,
          new Paragraph({ text: "" }),
          dataset.records.length > 0
            ? new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } })
            : new Paragraph({ text: "Bu dönem için kayıtlı tahsilat yok." }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `tahsilatlar-${sanitizeArtifactFilenameSegment(dataset.period.isoLabel)}.docx`;
  return {
    format: "docx",
    filename,
    mimeType: ARTIFACT_MIME_TYPES.docx,
    content: buffer,
  };
}
