import { describe, expect, it } from "vitest";
import { parseSpreadsheetFile, UnsupportedSpreadsheetFileError } from "../spreadsheet-parser";

function csvBuffer(lines: readonly string[]): Buffer {
  return Buffer.from(lines.join("\n"), "utf-8");
}

describe("parseSpreadsheetFile", () => {
  it("uses row 1 as headers when it already looks like a real header row", async () => {
    const buffer = csvBuffer(["Ünvan,Vergi No", "Acme,1234567890"]);
    const { headers, rows } = await parseSpreadsheetFile(buffer, "customers.csv");
    expect(headers).toEqual(["Ünvan", "Vergi No"]);
    expect(rows).toEqual([{ "Ünvan": "Acme", "Vergi No": "1234567890" }]);
  });

  // Live production repro: a Bizim Hesap-style export with a report title
  // merged across the top row (read back by the parser as the same text
  // repeated in every column) instead of real column headers — every
  // column mapped to nothing and 0 of 384 rows imported.
  it("skips a duplicated title row and uses the next row that has distinct headers", async () => {
    const buffer = csvBuffer([
      "CARİ RAPORU,CARİ RAPORU,CARİ RAPORU",
      "Ünvan,Vergi No,Telefon",
      "Acme,1234567890,5551234567",
    ]);
    const { headers, rows } = await parseSpreadsheetFile(buffer, "customers.csv");
    expect(headers).toEqual(["Ünvan", "Vergi No", "Telefon"]);
    expect(rows).toEqual([{ "Ünvan": "Acme", "Vergi No": "1234567890", "Telefon": "5551234567" }]);
  });

  it("falls back to row 1 when no row in the scan window has distinct headers", async () => {
    const buffer = csvBuffer(["Tekli Sütun", "Değer 1", "Değer 2"]);
    const { headers, rows } = await parseSpreadsheetFile(buffer, "customers.csv");
    expect(headers).toEqual(["Tekli Sütun"]);
    expect(rows).toEqual([{ "Tekli Sütun": "Değer 1" }, { "Tekli Sütun": "Değer 2" }]);
  });

  // Live production repro (Vercel runtime error logs): a real upload named
  // "*.xlsx" whose content ExcelJS's OOXML loader can't parse — most likely
  // a legacy .xls (an entirely different, pre-2007 binary format) saved
  // with an .xlsx extension — threw an opaque "Cannot read properties of
  // undefined (reading 'sheets')" TypeError that the API route surfaced as
  // a bare 500. Must become an actionable UnsupportedSpreadsheetFileError
  // instead, which the route already turns into a helpful 400.
  it("raises an actionable error instead of an opaque TypeError when '.xlsx' content isn't a real OOXML workbook", async () => {
    const buffer = Buffer.from("this is not a real xlsx file", "utf-8");
    await expect(parseSpreadsheetFile(buffer, "eski-format.xlsx")).rejects.toThrow(UnsupportedSpreadsheetFileError);
    await expect(parseSpreadsheetFile(buffer, "eski-format.xlsx")).rejects.toThrow(/xls/i);
  });
});
