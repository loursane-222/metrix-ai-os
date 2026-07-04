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
    CASH: "Bugun nakit girisi ve geciken alacaklari tek listede netlestir.",
    COLLECTION: "Bugun en eski ve en yuksek tutarli tahsilat takibini kapat veya tarih al.",
    SALES: "Bugun sicak ve bekleyen tekliflerde kapanis veya takip tarihini netlestir.",
    EXECUTION: "Bugun bekleyen operasyon aksiyonlarinda sahiplik ve tarih netlestir.",
    DECISION_FOLLOW_UP: "Bugun acik kararlarin sonucunu netlestir.",
    MARKET: "Bugun piyasa etkisini fiyatlama, teklif ve nakit kararlarina yansit.",
    DATA_QUALITY: "Bugun eksik veri kaynaklarini ayir ve kesin olmayan yorumlari sinirla.",
    GENERAL_CONTROL: "Bugun nakit, satis ve tahsilat basliklarini kisa bir kontrol turundan gecir.",
  };

  return map[area];
}

export function defaultReason(area: ExecutiveFocusArea): string {
  const map: Record<ExecutiveFocusArea, string> = {
    CASH: "Nakit tarafinda yonetim dikkati gerektiren sinyal var.",
    COLLECTION: "Tahsilat tarafinda takip gerektiren sinyal var.",
    SALES: "Satis pipeline tarafinda takip gerektiren sinyal var.",
    EXECUTION: "Icra tarafinda yaslanan veya sahiplik isteyen konu var.",
    DECISION_FOLLOW_UP: "Sahiplenilmis veya acik bir karar takip bekliyor.",
    MARKET: "Piyasa etkisi yonetim kararlarina yansitilmali.",
    DATA_QUALITY: "Veri kalitesi bugunku okumanin guvenini sinirliyor.",
    GENERAL_CONTROL: "Belirgin tek risk yok; gunluk yonetim ritmini korumak yeterli.",
  };

  return map[area];
}
