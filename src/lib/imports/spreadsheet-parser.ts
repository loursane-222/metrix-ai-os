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

  const headerRowNumber = findHeaderRowNumber(worksheet);
  const headers: string[] = [];
  worksheet.getRow(headerRowNumber).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
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

// Turkish accounting-software exports (Bizim Hesap, Logo, Mikro, Paraşüt —
// the exact programs this feature's own copy names) commonly put a report
// title in row 1, merged across several columns, with the real column
// headers one or more rows below it. ExcelJS replicates a merged cell's
// value into every underlying cell when iterating, so that title row reads
// back as the SAME text repeated across every column — e.g. "CARİ RAPORU"
// in 3 separate header slots. Unconditionally treating row 1 as the header
// row then maps zero real columns and silently imports nothing, with no
// indication to the user beyond an oddly duplicated "unmatched columns"
// list. Real header rows are, in practice, always made of distinct labels
// (a file can't legitimately have two columns both named "Müşteri Adı"),
// so a row with any duplicate non-empty cell is never a valid header row —
// scan forward for the first row that has at least two non-empty cells,
// all distinct, and use that. Falls back to row 1 unchanged if nothing in
// the scan window qualifies, preserving prior behavior for every file
// shaped the way this already worked for.
const HEADER_ROW_SCAN_LIMIT = 5;
function findHeaderRowNumber(worksheet: ExcelJS.Worksheet): number {
  const scanLimit = Math.min(HEADER_ROW_SCAN_LIMIT, worksheet.rowCount || HEADER_ROW_SCAN_LIMIT);
  for (let rowNumber = 1; rowNumber <= scanLimit; rowNumber++) {
    const values: string[] = [];
    worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => {
      const value = cellToString(cell.value);
      if (value) values.push(value);
    });
    if (values.length >= 2 && new Set(values).size === values.length) return rowNumber;
  }
  return 1;
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
