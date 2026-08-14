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
      reason: "Tahsilat kararında finansal risk ve müşteri ilişkisi birlikte okunmalı.",
    },
  },
  {
    topic: "hiring",
    terms: ["ise alim", "personel al", "ekibe kat", "yeni calisan"],
    activation: {
      topic: "hiring",
      roles: ["chro", "cfo"],
      reason: "İşe alım kararında ekip kapasitesi ve maliyet etkisi birlikte değerlendirilmeli.",
    },
  },
  {
    topic: "new_customer",
    terms: ["yeni musteri", "lead", "firsat", "teklif"],
    activation: {
      topic: "new_customer",
      roles: ["sales", "cco"],
      reason: "Yeni müşteri kararında satış fırsatı ve iliski kalitesi birlikte okunmalı.",
    },
  },
  {
    topic: "operations_problem",
    terms: ["operasyon", "teslimat", "gecikti", "kapasite", "darbogaz"],
    activation: {
      topic: "operations_problem",
      roles: ["coo", "cfo"],
      reason: "Operasyon problemi teslim riski ve finansal etki birlikte okunarak ele alınmalı.",
    },
  },
  {
    topic: "cashflow",
    terms: ["nakit", "cashflow", "kasa", "finansman"],
    activation: {
      topic: "cashflow",
      roles: ["cfo", "general-manager"],
      reason: "Nakit kararları finans disiplini ve genel şirket önceliği gerektirir.",
    },
  },
  {
    topic: "pricing",
    terms: ["fiyat", "indirim", "marj", "zam"],
    activation: {
      topic: "pricing",
      roles: ["sales", "cfo"],
      reason: "Fiyat kararında satış fırsatı ve kârlılık birlikte korunmalı.",
    },
  },
  {
    topic: "team",
    terms: ["ekip", "performans", "motivasyon", "rol"],
    activation: {
      topic: "team",
      roles: ["chro", "coo"],
      reason: "Ekip konusu insan yönetimi ve operasyon kapasitesi birlikte okunarak değerlendirilmeli.",
    },
  },
  {
    topic: "marketing",
    terms: ["pazarlama", "kampanya", "marka", "icerik"],
    activation: {
      topic: "marketing",
      roles: ["cmo", "sales"],
      reason: "Pazarlama kararında mesaj, kanal ve satış etkisi birlikte değerlendirilmeli.",
    },
  },
  {
    topic: "customer_conflict",
    terms: ["sikayet", "musteri sorunu", "kavga", "memnun degil"],
    activation: {
      topic: "customer_conflict",
      roles: ["cco", "general-manager"],
      reason: "Müşteri gerilimi ilişki, itibar ve yönetici kararı gerektirir.",
    },
  },
];

const DEFAULT_ACTIVATION: ExecutiveCouncilActivation = {
  topic: "general",
  roles: ["general-manager", "executive-assistant"],
  reason: "Belirgin uzmanlık sinyali yoksa genel müdür ve takip aklı yeterlidir.",
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
