import type {
  ExecutiveActivationTopic,
  ExecutiveCouncilActivation,
} from "./executive-constitution.types";

type ActivationRule = {
  topic: ExecutiveActivationTopic;
  terms: string[];
  activation: ExecutiveCouncilActivation;
};

const ACTIVATION_RULES: ActivationRule[] = [
  {
    topic: "collection",
    terms: ["tahsilat", "odeme", "alacak", "vade", "gecikme"],
    activation: {
      topic: "collection",
      roles: ["cfo", "cco"],
      reason: "Tahsilat kararinda finansal risk ve musteri iliskisi birlikte okunmali.",
    },
  },
  {
    topic: "hiring",
    terms: ["ise alim", "personel al", "ekibe kat", "yeni calisan"],
    activation: {
      topic: "hiring",
      roles: ["chro", "cfo"],
      reason: "Ise alim kararinda ekip kapasitesi ve maliyet etkisi birlikte degerlendirilmeli.",
    },
  },
  {
    topic: "new_customer",
    terms: ["yeni musteri", "lead", "firsat", "teklif"],
    activation: {
      topic: "new_customer",
      roles: ["sales", "cco"],
      reason: "Yeni musteri kararinda satis firsati ve iliski kalitesi birlikte okunmali.",
    },
  },
  {
    topic: "operations_problem",
    terms: ["operasyon", "teslimat", "gecikti", "kapasite", "darbogaz"],
    activation: {
      topic: "operations_problem",
      roles: ["coo", "cfo"],
      reason: "Operasyon problemi teslim riski ve finansal etki birlikte okunarak ele alinmali.",
    },
  },
  {
    topic: "cashflow",
    terms: ["nakit", "cashflow", "kasa", "finansman"],
    activation: {
      topic: "cashflow",
      roles: ["cfo", "general-manager"],
      reason: "Nakit kararlari finans disiplini ve genel sirket onceligi gerektirir.",
    },
  },
  {
    topic: "pricing",
    terms: ["fiyat", "indirim", "marj", "zam"],
    activation: {
      topic: "pricing",
      roles: ["sales", "cfo"],
      reason: "Fiyat kararinda satis firsati ve karlilik birlikte korunmali.",
    },
  },
  {
    topic: "team",
    terms: ["ekip", "performans", "motivasyon", "rol"],
    activation: {
      topic: "team",
      roles: ["chro", "coo"],
      reason: "Ekip konusu insan yonetimi ve operasyon kapasitesi birlikte okunarak degerlendirilmeli.",
    },
  },
  {
    topic: "marketing",
    terms: ["pazarlama", "kampanya", "marka", "icerik"],
    activation: {
      topic: "marketing",
      roles: ["cmo", "sales"],
      reason: "Pazarlama kararinda mesaj, kanal ve satis etkisi birlikte degerlendirilmeli.",
    },
  },
  {
    topic: "customer_conflict",
    terms: ["sikayet", "musteri sorunu", "kavga", "memnun degil"],
    activation: {
      topic: "customer_conflict",
      roles: ["cco", "general-manager"],
      reason: "Musteri gerilimi iliski, itibar ve yonetici karari gerektirir.",
    },
  },
];

const DEFAULT_ACTIVATION: ExecutiveCouncilActivation = {
  topic: "general",
  roles: ["general-manager", "executive-assistant"],
  reason: "Belirgin uzmanlik sinyali yoksa genel mudur ve takip akli yeterlidir.",
};

export function resolveExecutiveCouncilActivation(
  message: string,
): ExecutiveCouncilActivation {
  const normalizedMessage = normalizeActivationText(message);
  const rule = ACTIVATION_RULES.find((item) =>
    item.terms.some((term) =>
      normalizedMessage.includes(normalizeActivationText(term)),
    ),
  );

  return rule?.activation ?? DEFAULT_ACTIVATION;
}

function normalizeActivationText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ");
}
