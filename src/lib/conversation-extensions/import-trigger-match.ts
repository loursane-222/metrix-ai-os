// Real-world phrasing recognition for the "import from Excel" family of
// conversation extensions. The prior implementation anchored a full-string
// regex to one exact verb form per domain (e.g. "...müşteri aktar" only),
// so any other conjugation ("aktaracağız", "aktarmak istiyorum", "aktarsana"
// ...) or extra words fell through to unstructured LLM generation, which
// fabricated a response instead of opening the import page. Matching on
// stems anywhere in the utterance (source + domain + verb all present,
// order-independent) trades a narrow anchor for real recall while staying
// a deterministic, non-LLM check — this extension only ever triggers a
// NAVIGATE, never a mutation, so the false-positive cost of over-matching
// stays low.
const SOURCE_STEM = /(?:excel|csv)/iu;
const VERB_STEM = /(?:aktar|yükle)/iu;

const DOMAIN_STEMS: readonly RegExp[] = [
  /müşteri/iu,
  /ürün|hizmet/iu,
  /fatura/iu,
  /tedarikçi/iu,
  /tahsilat/iu,
  /teklif/iu,
  /sipariş/iu,
  /stok/iu,
  /üretim/iu,
];

export function matchesDomainImportTrigger(text: string, domainStem: RegExp): boolean {
  return SOURCE_STEM.test(text) && domainStem.test(text) && VERB_STEM.test(text);
}

export function matchesDomainlessImportTrigger(text: string): boolean {
  if (!SOURCE_STEM.test(text) || !VERB_STEM.test(text)) return false;
  return !DOMAIN_STEMS.some((stem) => stem.test(text));
}
