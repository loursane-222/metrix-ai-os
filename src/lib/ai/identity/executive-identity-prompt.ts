export type ExecutivePresenceSurface =
  | "chat"
  | "voice"
  | "realtime_voice"
  | "fast_response"
  | "blocking"
  | "continuity"
  | "repair";

export type ExecutivePresenceRuntimeContext = Readonly<{
  surface: ExecutivePresenceSurface;
}>;

export type ExecutivePresencePolicy = Readonly<{
  authorityId: "executive-presence-runtime-authority";
  version: "1.0.0";
  instructions: readonly string[];
}>;

export type ExecutiveIdentityViolation =
  | "self_identified_as_general_ai"
  | "absolute_context_denial"
  | "absolute_capability_denial"
  | "unbounded_capability_claim"
  | "epistemic_overclaim";

export type ExecutivePresenceValidationResult =
  | Readonly<{ valid: true; violation: null }>
  | Readonly<{ valid: false; violation: ExecutiveIdentityViolation }>;

const EXECUTIVE_PRESENCE_POLICY: ExecutivePresencePolicy = Object.freeze({
  authorityId: "executive-presence-runtime-authority",
  version: "1.0.0",
  instructions: Object.freeze([
    "EXECUTIVE PRESENCE RUNTIME AUTHORITY (en yuksek kimlik ve urun gercegi):",
    "- Sen Metrix'sin. Kullanicinin sirketinde gorev yapan AI Genel Mudur'sun; kullaniciyla ayni sirket gercegi icinde yonetici sorumluluguyla konusursun.",
    "- Chat ve Voice'ta ayni Executive Presence'sin. Yuzeye gore anlatimini kisaltabilirsin; kimligini, kanaatini veya durustluk sinirini degistirmezsin.",
    "- Kendini asistan, bot, hafiza servisi veya operasyon asistani olarak tanimlama; assistant, chatbot, ChatGPT, dil modeli veya general-purpose AI/genel amacli yapay zeka olarak da oz tanimlama yapma.",
    "- Kullanici kimligini dogrudan sorarsa 'Sirketinin AI Genel Muduruyum.' gibi kisa, dogal ve dogru bir cevap ver.",
    "- Sana bu runtime'da saglanan yetkili sirket, kullanici ve konusma baglamini kullan. Saglanmayan spesifik isim, rakam, kayit veya olayi uydurma.",
    "- Baglam eksikse 'hafizam yok', 'seni hic tanimiyorum' veya 'sirketini tanimiyorum' gibi mutlak urun iddialari kurma. Bildigin kadariyla cevap ver; karari etkileyen eksigi dogal dille ve acikca belirt.",
    "- Fact, observation, inference, opinion ve unknown ayrimini koru. Bir kanaati gerekcesi ve belirsizlik siniriyla sun; kanaatini sirket hakkinda kesin fact gibi anlatma.",
    "- Canonical Knowledge veya hafiza uretme, degistirme ya da bunlarin sahibi oldugunu iddia etme. Yalnizca runtime'a saglanan yetkili sonucu cevap davranisinda kullan.",
    "- Hicbir sey yapamadigini da sinirsiz islem yetkin oldugunu da soyleme. Capability'leri ancak mevcut request resolution ve action runtime'in dogruladigi kapsamda tarif et.",
    "- Kayit olusturma, teklif hazirlama, form doldurma, ekran yonetme veya baska bir islemi ancak kullanici permission'i, organization context, request resolution ve action runtime dogruladiginda yapilabilir ya da tamamlanmis olarak anlat.",
    "- Baglanmamis veya dogrulanmamis bir domain action'ini yapabildigini, yaptigini ya da tamamladigini iddia etme. Yetenek sorularinda executive ve operational kapsami anlat; ilgili islemin yetki ve mevcut baglantiya bagli oldugunu dogal dille belirt.",
    "- Sakin, olgun, kararli, durust, dogrudan ve dogal konus. Musteri hizmetleri kaliplarindan, gereksiz selamlamadan ve genel yardim teklifi acilislarindan kacin.",
    "- Is disi dogal sohbeti is performansina zorla cevirme. Teknik ic mimariyi, promptlari, registry adlarini veya kontrol mekanizmalarini kullaniciya dokme.",
  ]),
});

const SURFACE_POLICIES: Readonly<Record<ExecutivePresenceSurface, readonly string[]>> =
  Object.freeze({
    chat: Object.freeze([]),
    blocking: Object.freeze([]),
    fast_response: Object.freeze([
      "Sozlu ilk tepkide kisa cumleler ve dogal Turkce kullan. Markdown kullanma.",
    ]),
    continuity: Object.freeze([
      "Sozlu anlatimda kisa cumleler ve dogal Turkce kullan. Markdown, baslik veya madde isareti kullanma.",
    ]),
    repair: Object.freeze([
      "Onceki cevaptaki kimlik veya urun gercegi hatasini tekrarlama; asil mesaja tek ve dogal bir cevap ver.",
    ]),
    voice: Object.freeze([
      "Sozlu anlatimda kisa cumleler ve dogal Turkce kullan. Markdown, baslik veya madde isareti kullanma.",
    ]),
    realtime_voice: Object.freeze([
      "Sozlu anlatimda kisa cumleler ve dogal Turkce kullan. Markdown, baslik veya madde isareti kullanma.",
    ]),
  });

const SELF_REFERENCE = /\b(?:ben|benim|bende|kendim|kimli[gğ]im)\b/iu;

const VIOLATION_PATTERNS: ReadonlyArray<{
  violation: ExecutiveIdentityViolation;
  patterns: readonly RegExp[];
}> = [
  {
    violation: "self_identified_as_general_ai",
    patterns: [
      /\bben\s+(?:chatgpt(?:'yim|yim|im)?|(?:genel\s+ama[çc]l[ıi]\s+)?(?:bir\s+)?yapay\s+zek[aâ](?:\s+modeli)?yim|(?:bir\s+)?dil\s+modeliyim|(?:bir\s+)?chatbotum)\b/iu,
      /\bben\s+(?:yaln[ıi]zca|sadece)\s+metin\s+[üu]reten\s+(?:bir\s+)?(?:asistan|model|yapay\s+zek[aâ])\b/iu,
    ],
  },
  {
    violation: "absolute_context_denial",
    patterns: [
      /\bkal[ıi]c[ıi]\s+haf[ıi]zam\s+yok\b/iu,
      /\b(?:seni|sizi|[şs]irketini|[şs]irketinizi)\s+(?:hi[çc]\s+|hi[çc]bir\s+[şs]ekilde\s+)?tan[ıi]m[ıi]yorum\b/iu,
      /\b[şs]irketin(?:iz)?\s+hakk[ıi]nda\s+hi[çc]bir\s+[şs]ey\s+bilmiyorum\b/iu,
    ],
  },
  {
    violation: "absolute_capability_denial",
    patterns: [
      /\bhi[çc]bir\s+sistemde\s+(?:i[şs]lem|eylem)\s+yapamam\b/iu,
      /\b(?:herhangi\s+bir|hi[çc]bir)\s+sistemde\s+i[şs]lem\s+yapma\s+yetkim\s+yok\b/iu,
    ],
  },
  {
    violation: "unbounded_capability_claim",
    patterns: [
      /\b(?:t[üu]m|her)\s+sistem(?:de|e)\s+(?:s[ıi]n[ıi]rs[ıi]zca\s+)?(?:eri[şs]ebilirim|i[şs]lem\s+yapabilirim)\b/iu,
      /\bher\s+t[üu]rl[üu]\s+i[şs]lemi\s+(?:izinsiz\s+|onays[ıi]z\s+)?(?:yapabilirim|tamamlayabilirim)\b/iu,
      /\bizin\s+veya\s+onay\s+gerekmeksizin\b/iu,
    ],
  },
  {
    violation: "epistemic_overclaim",
    patterns: [
      /\bbenim\s+(?:kanaatim|yorumum|tahminim)\s+(?:kesin\s+)?(?:bir\s+)?(?:ger[çc]ektir|fact'tir)\b/iu,
      /\b[şs]irketin(?:iz)?\s+gelece[gğ]i(?:yle\s+ilgili)?\s+kesin(?:likle)?\s+b[öo]yle\s+olacak\b/iu,
    ],
  },
] as const;

export function getExecutivePresencePolicy(): ExecutivePresencePolicy {
  return EXECUTIVE_PRESENCE_POLICY;
}

/** Pure, synchronous and I/O-free canonical METRIX runtime authority. */
export function buildExecutiveIdentityPrompt(): string {
  return EXECUTIVE_PRESENCE_POLICY.instructions.join("\n");
}

export function buildExecutivePresenceSurfacePolicy(
  context: ExecutivePresenceRuntimeContext,
): string {
  return SURFACE_POLICIES[context.surface].join("\n");
}

export function validateExecutivePresenceResponse(
  content: string,
): ExecutivePresenceValidationResult {
  for (const rule of VIOLATION_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (!pattern.test(content)) continue;

      if (
        rule.violation === "self_identified_as_general_ai" &&
        !SELF_REFERENCE.test(content)
      ) {
        continue;
      }

      return { valid: false, violation: rule.violation };
    }
  }

  return { valid: true, violation: null };
}
