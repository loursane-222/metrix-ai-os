import type {
  ClassifyManagerAdviceInput,
  ManagerAdviceCategory,
  ManagerAdviceClassification,
  ManagerAdviceConfidence,
} from "./manager-advice-classifier.types";

type ManagerAdviceRule = {
  category: Exclude<ManagerAdviceCategory, "GENERAL">;
  high: RegExp[];
  medium: RegExp[];
};

// JS's `\b` and `\w` are ASCII-only — they don't recognize Turkish letters
// (ı, ş, ğ, ü, ö, ç) as word characters at all. That means every `\b`
// immediately touching one of those letters (leading, e.g. `\bödeme`, or
// trailing, e.g. `pahalı\b`) silently fails to match ANY text, including the
// letter's own correctly-spelled Turkish word — `/\bpahalı\b/u` never
// matches "pahalı" itself. Several rules below already carry a hand-written
// ASCII-normalized twin (`ödeme`/`odeme`, `pahalı`/`pahali`) to work around
// this, but that only covers messages typed with the ASCII substitute
// letter — a user typing correct Turkish text on a Turkish keyboard still
// falls through undetected. Rather than re-deriving which of the ~90
// patterns below are affected by hand, every pattern is compiled through
// turkishAwareBoundary(), which rewrites `\b` into a Unicode-property-based
// lookaround equivalent that treats Turkish letters as word characters too.
// This changes only boundary semantics — the matched word content is
// unchanged — so it strictly fixes missed matches without loosening any
// pattern's intent.
const UNICODE_WORD_BOUNDARY = String.raw`(?:(?<=[\p{L}\p{N}_])(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])(?=[\p{L}\p{N}_]))`;
function turkishAwareBoundary(pattern: RegExp): RegExp {
  return new RegExp(pattern.source.split("\\b").join(UNICODE_WORD_BOUNDARY), pattern.flags);
}
function turkishAwareRule(rule: { category: string; high: RegExp[]; medium: RegExp[] }): ManagerAdviceRule {
  return { category: rule.category as ManagerAdviceRule["category"], high: rule.high.map(turkishAwareBoundary), medium: rule.medium.map(turkishAwareBoundary) };
}

const MANAGER_ADVICE_RULES: ManagerAdviceRule[] = [
  {
    category: "COLLECTION",
    high: [
      /\btahsilat\b/u,
      /\bödeme\s+alam/u,
      /\bodeme\s+alam/u,
      /\bparam[ıi]\s+alam/u,
      /\balacağ[ıi]m\s+kald[ıi]\b/u,
      /\balacag[ıi]m\s+kald[ıi]\b/u,
      /\bödeme\s+yapm[ıi]yor\b/u,
      /\bodeme\s+yapm[ıi]yor\b/u,
      /\bödeme\s+yapmad[ıi]\b/u,
      /\bodeme\s+yapmad[ıi]\b/u,
      /\bödeme\s+gecikti\b/u,
      /\bodeme\s+gecikti\b/u,
      /\bödeme\s+sözü\s+verdi\s+ama\s+yat[ıi]rmad[ıi]\b/u,
      /\bodeme\s+sozu\s+verdi\s+ama\s+yat[ıi]rmad[ıi]\b/u,
      /\bborc(?:u|unu)?\s+ödem/u,
      /\bborc(?:u|unu)?\s+odem/u,
      /\bborc(?:u|unu)?\s+ödemedi\b/u,
      /\bborc(?:u|unu)?\s+odemedi\b/u,
      /\bvadeyi\s+geçti\b/u,
      /\bvadeyi\s+gecti\b/u,
      /\baç[ıi]k\s+bakiye\b/u,
      /\bac[ıi]k\s+bakiye\b/u,
    ],
    medium: [/\bvade\b/u, /\balacak\b/u, /\bgecikmiş\s+ödeme\b/u],
  },
  {
    category: "PRICING",
    high: [
      /\bpahalı\b/u,
      /\bpahali\b/u,
      /\byüksek\s+bul/u,
      /\byuksek\s+bul/u,
      /\bindirim\b/u,
      /\biskonto\b/u,
    ],
    // Bare "fiyat*" (fiyat/fiyatı/fiyatlandırma/...) is a generic domain
    // noun, not a decision-shaped signal on its own — a routine "fiyatı
    // güncelle" or "fiyat listesini göster" used to classify HIGH and inject
    // the PRICING risk-guidance block into a turn with no pricing decision
    // in it at all. Demoted alongside the other bare-noun MEDIUM entries
    // below (see manager-advice-advisory-prompt.service.ts's
    // below-HIGH-confidence rationale, which already exempts this exact
    // pattern for "teklif"/"stok"/"hedef").
    medium: [/\bfiyat[a-zçğıöşüı]*\b/u, /\bücret\b/u, /\bucret\b/u, /\bzam\b/u, /\bmarj\b/u, /\bteklif(?:i|im|imiz)?\b/u],
  },
  {
    category: "CUSTOMER_CONFLICT",
    high: [
      /\bmüşteri\s+(?:şikayet|kız|sinir|memnun\s+değil)/u,
      /\bmusteri\s+(?:sikayet|kiz|sinir|memnun\s+degil)/u,
      /\bşikayet\b/u,
      /\bsikayet\b/u,
      /\banlaşmazlık\b/u,
      /\banlasmazlik\b/u,
    ],
    medium: [/\bitiraz\b/u, /\bkriz\b/u, /\bmemnun\s+değil\b/u],
  },
  {
    category: "HIRING",
    high: [
      /\bişe\s+al/u,
      /\bise\s+al/u,
      /\bpersonel\s+al/u,
      /\beleman\s+al/u,
      /\baday\b/u,
      /\bmülakat\b/u,
      /\bmulakat\b/u,
    ],
    medium: [/\bpozisyon\b/u, /\bilan\b/u, /\bmaaş\s+teklifi\b/u],
  },
  {
    category: "TEAM",
    high: [
      /\bişi\s+bırak/u,
      /\bisi\s+birak/u,
    ],
    medium: [
      /\bmotivasyon\b/u, /\bperformans\b/u, /\bdevir\b/u,
      /\bpersonel(?:im|imiz)?\b/u, /\bekip\b/u, /\bçalışan(?:ım|lar)?\b/u, /\bcalisan(?:im|lar)?\b/u,
    ],
  },
  {
    category: "CASHFLOW",
    high: [
      /\bnakit\s+akış/u,
      /\bnakit\s+akis/u,
      /\bcashflow\b/u,
      /\bpara\s+akış/u,
      /\bpara\s+akis/u,
    ],
    medium: [/\bnakit\b/u, /\blikidite\b/u, /\bkasam\b/u, /\bkasa\b/u],
  },
  {
    category: "OPERATIONS",
    high: [],
    medium: [
      /\bverimlilik\b/u, /\baksıyor\b/u, /\baksiyor\b/u, /\bgecik/u,
      /\boperasyon\b/u, /\bsüreç\b/u, /\bsurec\b/u, /\bteslimat\b/u, /\bstok\b/u, /\btermin\b/u,
    ],
  },
  {
    category: "SALES",
    high: [
      /\blead\b/u,
      /\bpotansiyel\s+müşteri\b/u,
    ],
    // "Yeni müşteri" collides with the literal customer-creation route/button
    // label ("Yeni Müşteri" → /metrix/customers/new) — a routine "yeni
    // müşteri ekle" used to classify HIGH and inject the SALES risk-guidance
    // block into a plain create-a-record request with no sales decision in
    // it at all.
    medium: [/\byeni\s+müşteri\b/u, /\byeni\s+musteri\b/u, /\bciro\b/u, /\bdönüşüm\b/u, /\bdonusum\b/u, /\bfırsat\b/u, /\bsatış\b/u, /\bsatis\b/u],
  },
  {
    category: "STRATEGY",
    high: [
      /\bönceliğim\b/u,
      /\bonceligim\b/u,
      /\bodaklan/u,
    ],
    medium: [
      /\bplan\b/u, /\byol\s+haritası\b/u, /\byol\s+haritasi\b/u,
      /\bstrateji\b/u, /\bhedef(?:im|imiz)?\b/u, /\bbüyüme\b/u, /\bbuyume\b/u,
    ],
  },
  {
    category: "PERSONAL",
    high: [
      /\byoruldum\b/u,
      /\bstres\b/u,
      /\bkararsızım\b/u,
      /\bkararsizim\b/u,
      /\bmotivasyonum\b/u,
    ],
    medium: [/\bkişisel\b/u, /\bkisisel\b/u, /\biyi\s+hissetm/u],
  },
].map(turkishAwareRule);

export function classifyManagerAdvice(
  input: ClassifyManagerAdviceInput,
): ManagerAdviceClassification {
  const message = normalizeMessage(input.message);

  if (!message) {
    return {
      category: "GENERAL",
      confidence: "LOW",
    };
  }

  for (const rule of MANAGER_ADVICE_RULES) {
    const confidence = evaluateRule(rule, message);

    if (confidence) {
      return {
        category: rule.category,
        confidence,
      };
    }
  }

  return {
    category: "GENERAL",
    confidence: "LOW",
  };
}

function evaluateRule(
  rule: ManagerAdviceRule,
  message: string,
): ManagerAdviceConfidence | null {
  if (rule.high.some((pattern) => pattern.test(message))) {
    return "HIGH";
  }

  if (rule.medium.some((pattern) => pattern.test(message))) {
    return "MEDIUM";
  }

  return null;
}

function normalizeMessage(message: string): string {
  return message.trim().toLocaleLowerCase("tr-TR");
}
