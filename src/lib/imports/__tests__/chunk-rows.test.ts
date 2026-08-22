import { describe, expect, it } from "vitest";
import { chunkRows } from "../chunk-rows";

describe("chunkRows", () => {
  it("splits into fixed-size pages, keeping a shorter last page", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk when everything fits within the size", () => {
    expect(chunkRows([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("returns an empty array for no rows", () => {
    expect(chunkRows([], 10)).toEqual([]);
  });

  it("splits a large import into many bounded pages instead of one request", () => {
    const rows = Array.from({ length: 381 }, (_, i) => i);
    const chunks = chunkRows(rows, 40);
    expect(chunks).toHaveLength(10);
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true);
    expect(chunks.flat()).toEqual(rows);
  });
});
