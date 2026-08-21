import ExcelJS from "exceljs";
import { Readable } from "node:stream";

export type ParsedSpreadsheet = Readonly<{ headers: readonly string[]; rows: readonly Record<string, string>[] }>;

export class UnsupportedSpreadsheetFileError extends Error {
  constructor() {
    super("Desteklenmeyen dosya türü. Yalnızca .xlsx veya .csv yükleyin.");
    this.name = "UnsupportedSpreadsheetFileError";
  }
}

export async function parseSpreadsheetFile(buffer: Buffer, filename: string): Promise<ParsedSpreadsheet> {
  const extension = filename.toLowerCase().split(".").pop();
  const workbook = new ExcelJS.Workbook();
  if (extension === "csv") {
    await workbook.csv.read(Readable.from(buffer));
  } else if (extension === "xlsx") {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } else {
    throw new UnsupportedSpreadsheetFileError();
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = cellToString(row.getCell(index + 1).value);
      record[header] = value;
      if (value) hasValue = true;
    });
    if (hasValue) rows.push(record);
  });

  return { headers: headers.filter(Boolean), rows };
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result !== undefined) return String(value.result);
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    return "";
  }
  return String(value).trim();
}
