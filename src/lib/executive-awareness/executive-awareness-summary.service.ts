import type {
  ExecutiveAwarenessConfidence,
  ExecutiveAwarenessDirection,
  ExecutiveAwarenessWatchArea,
  ExecutiveBusinessPosture,
} from "./executive-awareness.types";

const DIRECTION_LABEL: Record<ExecutiveAwarenessDirection, string> = {
  IMPROVING: "iyilesme sinyali veriyor",
  STABLE: "stabil seyrediyor",
  DETERIORATING: "kotuye gidis sinyali veriyor",
  CRITICAL: "kritik yonetim dikkati gerektiriyor",
  UNKNOWN: "yonu net okunamiyor",
};

const POSTURE_LABEL: Record<ExecutiveBusinessPosture, string> = {
  HEALTHY: "saglikli",
  WATCH: "izleme modunda",
  PRESSURED: "baski altinda",
  AT_RISK: "risk altinda",
};

const WATCH_AREA_LABEL: Record<ExecutiveAwarenessWatchArea, string> = {
  CASH: "nakit",
  SALES: "satis",
  COLLECTION: "tahsilat",
  MARKET: "piyasa",
  EXECUTION: "icra",
  DECISION_FOLLOW_UP: "karar takibi",
  DATA_QUALITY: "veri kalitesi",
};

export function buildExecutiveAwarenessNarrative(input: {
  direction: ExecutiveAwarenessDirection;
  posture: ExecutiveBusinessPosture;
  confidence: ExecutiveAwarenessConfidence;
  watchAreas: ExecutiveAwarenessWatchArea[];
  topNegativeDriver: string | null;
  topPositiveDriver: string | null;
}): string {
  if (input.direction === "UNKNOWN") {
    return "Sirketin genel yonu mevcut verilerle net okunamiyor; once veri kalitesi ve temel sinyaller tamamlanmali.";
  }

  const areaText = formatWatchAreas(input.watchAreas);
  const driver = input.topNegativeDriver ?? input.topPositiveDriver;
  const base = `Sirket ${POSTURE_LABEL[input.posture]} ve genel yon ${DIRECTION_LABEL[input.direction]}.`;

  if (driver && areaText) {
    return `${base} Ana izleme alani ${areaText}; belirleyici sinyal: ${driver}`;
  }

  if (areaText) {
    return `${base} Ana izleme alani ${areaText}.`;
  }

  return base;
}

export function buildExecutiveAwarenessManagementImplication(input: {
  direction: ExecutiveAwarenessDirection;
  posture: ExecutiveBusinessPosture;
  watchAreas: ExecutiveAwarenessWatchArea[];
}): string {
  if (input.direction === "CRITICAL" || input.posture === "AT_RISK") {
    return "Genel Mudur bugun risk azaltmaya, nakit/operasyon baskisini netlestirmeye ve geciken karar takiplerini kapatmaya odaklanmali.";
  }

  if (input.direction === "DETERIORATING" || input.posture === "PRESSURED") {
    return "Genel Mudur yeni buyume adimindan once baski yaratan alanlari daraltmali ve takip ritmini sikilastirmali.";
  }

  if (input.direction === "IMPROVING") {
    return "Genel Mudur iyilesme sinyalini korumali; kritik alanlarda yeni risk olusmadan satis ve tahsilat ritmini surdurmeli.";
  }

  if (input.direction === "UNKNOWN") {
    return "Genel Mudur kesin yorum yapmadan once eksik veri kaynaklarini tamamlamali ve sinyal gecmisinin olusmasini beklemeli.";
  }

  return "Genel Mudur mevcut ritmi korumali, izleme alanlarinda erken sapma olup olmadigini takip etmeli.";
}

export function buildExecutiveAwarenessRecommendedAttention(input: {
  direction: ExecutiveAwarenessDirection;
  posture: ExecutiveBusinessPosture;
  watchAreas: ExecutiveAwarenessWatchArea[];
}): string[] {
  const attention: string[] = [];

  if (input.watchAreas.includes("DATA_QUALITY")) {
    attention.push("Eksik veya hatali veri kaynaklarini kontrol et.");
  }
  if (input.watchAreas.includes("DECISION_FOLLOW_UP")) {
    attention.push("Acik veya gecikmis yonetim kararlarinin sonucunu netlestir.");
  }
  if (input.watchAreas.includes("CASH") || input.watchAreas.includes("COLLECTION")) {
    attention.push("Nakit ve tahsilat baskisini bugunku ilk takip konusu yap.");
  }
  if (input.watchAreas.includes("SALES")) {
    attention.push("Bekleyen teklifleri ve donusum riski olan firsatlari gozden gecir.");
  }
  if (input.watchAreas.includes("MARKET")) {
    attention.push("Piyasa etkisi olan basliklari fiyatlama ve nakit planina yansit.");
  }
  if (input.watchAreas.includes("EXECUTION")) {
    attention.push("Aksiyon bekleyen operasyon konularinda sahiplik ve tarih netlestir.");
  }

  if (attention.length === 0) {
    attention.push(
      input.posture === "HEALTHY"
        ? "Mevcut yonetim ritmini koru ve erken risk sinyallerini izle."
        : "Oncelikli risk alanlarini kisa bir yonetim kontroluyle gozden gecir.",
    );
  }

  if (input.direction === "CRITICAL" && !attention.some((item) => item.includes("bugunku ilk"))) {
    attention.unshift("Kritik sinyali bugunku ilk yonetim konusu yap.");
  }

  return attention.slice(0, 4);
}

export function buildExecutiveAwarenessDataQualityNote(
  failedSteps: string[],
): string | null {
  if (failedSteps.length === 0) return null;
  return `Bazi veri kaynaklari okunamadi: ${failedSteps.slice(0, 3).join(", ")}. Awareness dusuk guvenle uretilmis olabilir.`;
}

function formatWatchAreas(watchAreas: ExecutiveAwarenessWatchArea[]): string | null {
  if (watchAreas.length === 0) return null;
  return watchAreas.slice(0, 3).map((area) => WATCH_AREA_LABEL[area]).join(", ");
}
