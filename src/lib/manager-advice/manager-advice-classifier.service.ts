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
      /\bfiyat[a-zçğıöşüı]*\b/u,
      /\bpahalı\b/u,
      /\bpahali\b/u,
      /\byüksek\s+bul/u,
      /\byuksek\s+bul/u,
      /\bindirim\b/u,
      /\biskonto\b/u,
      /\bteklif(?:i|im|imiz)?\b/u,
    ],
    medium: [/\bücret\b/u, /\bucret\b/u, /\bzam\b/u, /\bmarj\b/u],
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
      /\bpersonel(?:im|imiz)?\b/u,
      /\bekip\b/u,
      /\bçalışan(?:ım|lar)?\b/u,
      /\bcalisan(?:im|lar)?\b/u,
      /\bişi\s+bırak/u,
      /\bisi\s+birak/u,
    ],
    medium: [/\bmotivasyon\b/u, /\bperformans\b/u, /\bdevir\b/u],
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
    high: [
      /\boperasyon\b/u,
      /\bsüreç\b/u,
      /\bsurec\b/u,
      /\bteslimat\b/u,
      /\bstok\b/u,
      /\btermin\b/u,
    ],
    medium: [/\bverimlilik\b/u, /\baksıyor\b/u, /\baksiyor\b/u, /\bgecik/u],
  },
  {
    category: "SALES",
    high: [
      /\bsatış\b/u,
      /\bsatis\b/u,
      /\byeni\s+müşteri\b/u,
      /\byeni\s+musteri\b/u,
      /\blead\b/u,
      /\bpotansiyel\s+müşteri\b/u,
    ],
    medium: [/\bciro\b/u, /\bdönüşüm\b/u, /\bdonusum\b/u, /\bfırsat\b/u],
  },
  {
    category: "STRATEGY",
    high: [
      /\bstrateji\b/u,
      /\bönceliğim\b/u,
      /\bonceligim\b/u,
      /\bhedef(?:im|imiz)?\b/u,
      /\bbüyüme\b/u,
      /\bbuyume\b/u,
      /\bodaklan/u,
    ],
    medium: [/\bplan\b/u, /\byol\s+haritası\b/u, /\byol\s+haritasi\b/u],
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
];

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
