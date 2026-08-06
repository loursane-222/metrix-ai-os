import type {
  ExecutiveAwarenessConfidence,
  ExecutiveAwarenessDirection,
  ExecutiveAwarenessWatchArea,
  ExecutiveBusinessPosture,
} from "./executive-awareness.types";

const DIRECTION_LABEL: Record<ExecutiveAwarenessDirection, string> = {
  IMPROVING: "iyileşme sinyali veriyor",
  STABLE: "stabil seyrediyor",
  DETERIORATING: "kötüye gidiş sinyali veriyor",
  CRITICAL: "kritik yönetim dikkati gerektiriyor",
  UNKNOWN: "yönü net okunamıyor",
};

const POSTURE_LABEL: Record<ExecutiveBusinessPosture, string> = {
  HEALTHY: "sağlıklı",
  WATCH: "izleme modunda",
  PRESSURED: "baskı altında",
  AT_RISK: "risk altında",
};

const WATCH_AREA_LABEL: Record<ExecutiveAwarenessWatchArea, string> = {
  CASH: "nakit",
  SALES: "satış",
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
    return "Şirketin genel yönü mevcut verilerle net okunamıyor; önce veri kalitesi ve temel sinyaller tamamlanmalı.";
  }

  const areaText = formatWatchAreas(input.watchAreas);
  const driver = input.topNegativeDriver ?? input.topPositiveDriver;
  const base = `Şirket ${POSTURE_LABEL[input.posture]} ve genel yön ${DIRECTION_LABEL[input.direction]}.`;

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
    return "Genel Müdür bugün risk azaltmaya, nakit/operasyon baskısını netleştirmeye ve geciken karar takiplerini kapatmaya odaklanmalı.";
  }

  if (input.direction === "DETERIORATING" || input.posture === "PRESSURED") {
    return "Genel Müdür yeni büyüme adımından önce baskı yaratan alanları daraltmalı ve takip ritmini sıkılaştırmalı.";
  }

  if (input.direction === "IMPROVING") {
    return "Genel Müdür iyileşme sinyalini korumalı; kritik alanlarda yeni risk oluşmadan satış ve tahsilat ritmini sürdürmeli.";
  }

  if (input.direction === "UNKNOWN") {
    return "Genel Müdür kesin yorum yapmadan önce eksik veri kaynaklarını tamamlamalı ve sinyal geçmişinin oluşmasını beklemeli.";
  }

  return "Genel Müdür mevcut ritmi korumalı, izleme alanlarında erken sapma olup olmadığını takip etmeli.";
}

export function buildExecutiveAwarenessRecommendedAttention(input: {
  direction: ExecutiveAwarenessDirection;
  posture: ExecutiveBusinessPosture;
  watchAreas: ExecutiveAwarenessWatchArea[];
}): string[] {
  const attention: string[] = [];

  if (input.watchAreas.includes("DATA_QUALITY")) {
    attention.push("Eksik veya hatalı veri kaynaklarını kontrol et.");
  }
  if (input.watchAreas.includes("DECISION_FOLLOW_UP")) {
    attention.push("Açık veya gecikmiş yönetim kararlarının sonucunu netleştir.");
  }
  if (input.watchAreas.includes("CASH") || input.watchAreas.includes("COLLECTION")) {
    attention.push("Nakit ve tahsilat baskisini bugunku ilk takip konusu yap.");
  }
  if (input.watchAreas.includes("SALES")) {
    attention.push("Bekleyen teklifleri ve dönüşüm riski olan fırsatları gözden geçir.");
  }
  if (input.watchAreas.includes("MARKET")) {
    attention.push("Piyasa etkisi olan basliklari fiyatlama ve nakit planina yansit.");
  }
  if (input.watchAreas.includes("EXECUTION")) {
    attention.push("Aksiyon bekleyen operasyon konularında sahiplik ve tarih netleştir.");
  }

  if (attention.length === 0) {
    attention.push(
      input.posture === "HEALTHY"
        ? "Mevcut yönetim ritmini koru ve erken risk sinyallerini izle."
        : "Öncelikli risk alanlarını kısa bir yönetim kontrolüyle gözden geçir.",
    );
  }

  if (input.direction === "CRITICAL" && !attention.some((item) => item.includes("bugunku ilk"))) {
    attention.unshift("Kritik sinyali bugünkü ilk yönetim konusu yap.");
  }

  return attention.slice(0, 4);
}

export function buildExecutiveAwarenessDataQualityNote(
  failedSteps: string[],
): string | null {
  if (failedSteps.length === 0) return null;
  return `Bazı veri kaynakları okunamadı: ${failedSteps.slice(0, 3).join(", ")}. Farkındalık düşük güvenle üretilmiş olabilir.`;
}

function formatWatchAreas(watchAreas: ExecutiveAwarenessWatchArea[]): string | null {
  if (watchAreas.length === 0) return null;
  return watchAreas.slice(0, 3).map((area) => WATCH_AREA_LABEL[area]).join(", ");
}
