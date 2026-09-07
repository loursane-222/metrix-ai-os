import { describe, expect, it } from "vitest";
import { deliverOpeningSentences } from "../opening-delivery";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("incremental contextual entry delivery", () => {
  it("publishes a complete sentence before EOF and metadata, retaining the remainder once", async () => {
    const next = deferred();
    const first = deferred();
    const metadata = deferred();
    const published: string[] = [];
    let rawOutputs = 0;
    let metaRequested = false;
    async function* stream() {
      yield "Önce genel tabloyu";
      expect(published).toEqual([]);
      yield " değerlendireceğim. Ardından";
      await next.promise;
      yield " bağlantıları araştıracağım.";
    }
    const delivery = (async () => {
      await deliverOpeningSentences({ textStream: stream(), signal: new AbortController().signal,
        publish: (text) => { published.push(text); first.resolve(); },
        onFirstOutput: () => { rawOutputs++; } });
      metaRequested = true;
      await metadata.promise;
    })();
    await first.promise;
    expect(published).toEqual(["Önce genel tabloyu değerlendireceğim."]);
    expect(metaRequested).toBe(false);
    next.resolve();
    // Allow the iterator to finish; final metadata deliberately remains pending.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(metaRequested).toBe(true);
    expect(published).toEqual(["Önce genel tabloyu değerlendireceğim.", "Ardından bağlantıları araştıracağım."]);
    expect(rawOutputs).toBe(1);
    metadata.resolve();
    await delivery;
  });

  it.each([
    ["Dr. ", "Atlas için bağlantıları inceleyeceğim."],
    ["Oranı 3.", "14 bağlamında değerlendireceğim."],
    ["https://atlas.", "com adresiyle ilgili soruyu değerlendireceğim."],
    ["Prof. ", "Atlas konusunu değerlendireceğim."],
  ])("does not split abbreviation, decimal or URL: %s", async (a, b) => {
    const published: string[] = [];
    async function* stream() {
      yield a;
      expect(published).toEqual([]);
      yield b;
    }
    await deliverOpeningSentences({ textStream: stream(), signal: new AbortController().signal,
      publish: (text) => published.push(text), onFirstOutput: () => {} });
    expect(published).toEqual([a + b]);
  });

  it("drops unfinished text instead of exposing a truncated sentence", async () => {
    const published: string[] = [];
    async function* stream() { yield "Önce tabloyu değerlendireceğim. "; yield "Ardından açık"; }
    await deliverOpeningSentences({ textStream: stream(), signal: new AbortController().signal,
      publish: (text) => published.push(text), onFirstOutput: () => {} });
    expect(published).toEqual(["Önce tabloyu değerlendireceğim."]);
  });

  it("never publishes another sentence or remainder after cancellation", async () => {
    const abort = new AbortController();
    const published: string[] = [];
    async function* stream() {
      yield "Önce tabloyu değerlendireceğim. ";
      abort.abort();
      yield "Ardından bağlantıları araştıracağım.";
    }
    await deliverOpeningSentences({ textStream: stream(), signal: abort.signal,
      publish: (text) => published.push(text), onFirstOutput: () => {} });
    expect(published).toEqual(["Önce tabloyu değerlendireceğim."]);
  });
});
