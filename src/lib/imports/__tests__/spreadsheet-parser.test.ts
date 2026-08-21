import { describe, expect, it } from "vitest";
import { parseSpreadsheetFile } from "../spreadsheet-parser";

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
});
