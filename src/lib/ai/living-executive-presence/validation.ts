import type { LivingBehaviorProfile, LivingBehaviorValidationResult, LivingRepairGuidance, LivingBehaviorViolation } from "./contracts";

const normalize = (value: string): string => value.toLocaleLowerCase("tr-TR").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[ı]/g, "i").replace(/[ş]/g, "s").replace(/[ğ]/g, "g").replace(/[ç]/g, "c").replace(/[ö]/g, "o").replace(/[ü]/g, "u");

const RULES: readonly Readonly<{ violation: LivingBehaviorViolation; test: (content: string, profile: LivingBehaviorProfile) => boolean }>[] = [
  { violation: "generic_assistant_register", test: (c) => /\b(?:size|sana) nasil yardimci olabilirim\b|\bbaska bir konuda yardimci olabilir miyim\b/u.test(normalize(c)) },
  { violation: "external_advisor_register", test: (c, p) => ["business", "decision", "operational"].includes(p.mode) && /\b(?:size tavsiyem|bir danisman olarak|sizin sirketiniz)\b/iu.test(c) },
  { violation: "casual_forced_to_business", test: (c, p) => ["casual", "emotional"].includes(p.mode) && /\b(?:kpi|ciro hedefi|satis performansi|is planina cevirelim)\b/iu.test(c) },
  { violation: "self_identity_lost", test: (c, p) => p.mode === "self_identity" && !/\bmetrix\b|\bai genel mudur/iu.test(c) },
  { violation: "capability_absolute_denial", test: (c, p) => p.mode === "capability" && /\b(?:yalnizca|sadece) (?:tavsiye|metin) (?:verebilirim|uretebilirim)|\bislem yapamam\b/iu.test(c) },
  { violation: "capability_unbounded_claim", test: (c, p) => p.mode === "capability" && /\b(?:tum verilere erisebilirim|her sistemi yonetebilirim|tum islemleri onaysiz yapabilirim)\b/u.test(normalize(c)) },
  { violation: "repair_mechanism_exposed", test: (c, p) => p.surface === "repair" && /\b(?:onceki cevabimi duzeltiyorum|kalite kontrol|behavior runtime|validation|repair)\b/u.test(normalize(c)) },
  { violation: "voice_report_format", test: (c, p) => p.formatting === "spoken_plain_text" && /(?:^|\n)\s*(?:#{1,6}\s|[-*]\s|\d+[.)]\s)|\*\*[^*]+\*\*/u.test(c) },
  { violation: "unnecessary_identity_repetition", test: (c, p) => p.mode !== "self_identity" && /\b(?:ben metrix'im|ben metrixim|sirketinin ai genel muduruyum)\b/iu.test(c) },
];

export function validateLivingExecutiveBehavior(content: string, profile: LivingBehaviorProfile): LivingBehaviorValidationResult {
  const rule = RULES.find((candidate) => candidate.test(content, profile));
  return rule ? { valid: false, violation: rule.violation } : { valid: true, violation: null };
}

const GUIDANCE: Readonly<Record<LivingBehaviorViolation, string>> = Object.freeze({
  generic_assistant_register: "Hazir yardim kalibini at; asil mesaja dogrudan, dogal ve sahiplenen bir yonetici gibi cevap ver.",
  external_advisor_register: "Disaridan tavsiye veren biri gibi degil, sirketin icindeki yonetici olarak kanaatini sahiplen.",
  casual_forced_to_business: "Kullanicinin insani veya gundelik konusunu is analizine cevirmeden kisa ve dogal karsilik ver.",
  self_identity_lost: "Kimligi tek dogal cumlede METRIX ve sirketin AI Genel Muduru olarak ifade et; teknik aciklama ekleme.",
  capability_absolute_denial: "Operasyon kapsamını anlat; mutlak yetersizlik kurmadan gercek islemi yetki ve mevcut baglantiya bagla.",
  capability_unbounded_claim: "Kapsami yonetici diliyle anlat; erisim ve islemleri yetki, baglanti ve dogrulanmis action sonucuyla sinirla.",
  repair_mechanism_exposed: "Duzeltme veya kontrol mekanizmasindan soz etmeden kullanicinin asil mesajina tek dogal cevap ver.",
  voice_report_format: "Ayni icerigi kisa cumlelerle, basliksiz, listesiz ve markdown olmadan konusma diliyle ver.",
  unnecessary_identity_repetition: "Kimligi yeniden anlatma; devam eden iliski icinde dogrudan mesaja cevap ver.",
});

export function buildLivingRepairGuidance(violation: LivingBehaviorViolation): LivingRepairGuidance {
  return Object.freeze({ violation, instruction: GUIDANCE[violation] });
}
