import type {
  ExecutiveFocusArea,
  ExecutiveFocusItem,
  ExecutiveFocusLevel,
} from "./executive-focus.types";

const AREA_LABEL: Record<ExecutiveFocusArea, string> = {
  CASH: "nakit",
  COLLECTION: "tahsilat",
  SALES: "satis",
  EXECUTION: "icra",
  DECISION_FOLLOW_UP: "karar takibi",
  MARKET: "piyasa",
  DATA_QUALITY: "veri kalitesi",
  GENERAL_CONTROL: "genel kontrol",
};

const LEVEL_LABEL: Record<ExecutiveFocusLevel, string> = {
  NORMAL: "normal",
  WATCH: "izleme",
  IMPORTANT: "onemli",
  URGENT: "acil",
  BLOCKED: "blokaj",
};

export function buildExecutiveFocusSummary(input: {
  primaryFocus: ExecutiveFocusItem;
  secondaryFocus: ExecutiveFocusItem | null;
  hasConflict: boolean;
}): string {
  const primary = AREA_LABEL[input.primaryFocus.focusArea];
  if (input.secondaryFocus) {
    const secondary = AREA_LABEL[input.secondaryFocus.focusArea];
    const conflictText = input.hasConflict ? " Birden fazla alan sinyal veriyor; ilk sirayi daraltmak gerekiyor." : "";
    return `Bugunun ana odagi ${primary}; ikinci planda ${secondary} izlenmeli.${conflictText}`;
  }

  return `Bugunun ana odagi ${primary}; seviye ${LEVEL_LABEL[input.primaryFocus.focusLevel]}.`;
}

export function buildExecutiveFocusInstruction(input: {
  primaryFocus: ExecutiveFocusItem;
  secondaryFocus: ExecutiveFocusItem | null;
}): string {
  const secondaryText = input.secondaryFocus
    ? ` ${AREA_LABEL[input.secondaryFocus.focusArea]} alanini ikinci takip olarak tut.`
    : "";

  return `${input.primaryFocus.firstMove}${secondaryText}`;
}

export function focusAreaLabel(area: ExecutiveFocusArea): string {
  return AREA_LABEL[area];
}

export function defaultFirstMove(area: ExecutiveFocusArea): string {
  const map: Record<ExecutiveFocusArea, string> = {
    CASH: "Bugün nakit girişi ve geciken alacakları tek listede netleştir.",
    COLLECTION: "Bugün en eski ve en yüksek tutarlı tahsilat takibini kapat veya tarih al.",
    SALES: "Bugün sıcak ve bekleyen tekliflerde kapanış veya takip tarihini netleştir.",
    EXECUTION: "Bugün bekleyen operasyon aksiyonlarında sahiplik ve tarih netleştir.",
    DECISION_FOLLOW_UP: "Bugün açık kararların sonucunu netleştir.",
    MARKET: "Bugün piyasa etkisini fiyatlama, teklif ve nakit kararlarına yansıt.",
    DATA_QUALITY: "Bugün eksik veri kaynaklarını ayır ve kesin olmayan yorumları sınırla.",
    GENERAL_CONTROL: "Bugün nakit, satış ve tahsilat başlıklarını kısa bir kontrol turundan geçir.",
  };

  return map[area];
}

export function defaultReason(area: ExecutiveFocusArea): string {
  const map: Record<ExecutiveFocusArea, string> = {
    CASH: "Nakit tarafında yönetim dikkati gerektiren sinyal var.",
    COLLECTION: "Tahsilat tarafinda takip gerektiren sinyal var.",
    SALES: "Satış pipeline tarafında takip gerektiren sinyal var.",
    EXECUTION: "İcra tarafında yaslanan veya sahiplik isteyen konu var.",
    DECISION_FOLLOW_UP: "Sahiplenilmiş veya açık bir karar takip bekliyor.",
    MARKET: "Piyasa etkisi yönetim kararlarına yansıtılmalı.",
    DATA_QUALITY: "Veri kalitesi bugünkü okumanın güvenini sınırlıyor.",
    GENERAL_CONTROL: "Belirgin tek risk yok; günlük yönetim ritmini korumak yeterli.",
  };

  return map[area];
}
