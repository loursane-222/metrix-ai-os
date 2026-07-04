import type {
  AIGeneralManagerBrief,
  AIGeneralManagerBriefSection,
  AIGeneralManagerTone,
  ExecutiveAssessment,
  ExecutiveBrainContext,
  ExecutiveCouncil,
  ExecutiveDecision,
  ExecutiveDecisionCategory,
  ExecutiveDecisionPackage,
  StrategicProfile,
} from "./executive-brain.types";

export type BuildAIGeneralManagerBriefInput = {
  context: ExecutiveBrainContext;
  assessment: ExecutiveAssessment;
  council: ExecutiveCouncil;
  strategicProfile: StrategicProfile;
  decisionPackage: ExecutiveDecisionPackage;
};

export function buildAIGeneralManagerBrief(
  input: BuildAIGeneralManagerBriefInput,
): AIGeneralManagerBrief {
  const primaryDecision = input.decisionPackage.primaryDecision;
  const tone = decideTone(primaryDecision, input.strategicProfile);
  const firstActions = translateActions(primaryDecision);
  const risksToWatch = translateRisks(primaryDecision, input.council);
  const evidenceRefs = uniqueStrings([
    ...primaryDecision.evidenceRefs,
    ...input.decisionPackage.supportingDecisions.flatMap(
      (decision) => decision.evidenceRefs,
    ),
  ]);

  return {
    title: buildTitle(primaryDecision),
    openingMessage: buildOpeningMessage(primaryDecision, input.strategicProfile),
    primaryDecision: translateDecisionTitle(primaryDecision),
    whyThisMatters: buildWhyThisMatters(primaryDecision, input),
    firstActions,
    risksToWatch,
    followUp: buildFollowUp(primaryDecision),
    confidence: input.decisionPackage.confidence,
    tone,
    sayThisToday: buildSayThisToday(primaryDecision),
    sections: buildSections({
      primaryDecision,
      firstActions,
      risksToWatch,
      input,
    }),
    evidenceRefs,
  };
}

function buildTitle(decision: ExecutiveDecision): string {
  const titleByCategory: Record<ExecutiveDecisionCategory, string> = {
    FINANCE: "Bugünün finansal önceliği",
    SALES: "Bugünün ticari büyüme kararı",
    OPERATIONS: "Bugünün operasyon kararı",
    PEOPLE: "Bugünün ekip kararı",
    CUSTOMER: "Bugünün müşteri kararı",
    STRATEGY: "Bugünün stratejik kararı",
    EXECUTION: "Bugünün takip kararı",
  };

  return titleByCategory[decision.category];
}

function buildOpeningMessage(
  decision: ExecutiveDecision,
  strategicProfile: StrategicProfile,
): string {
  if (decision.category === "FINANCE") {
    return "Bugün önceliğimiz yeni risk almak değil, mevcut riski kapatmak.";
  }

  if (decision.category === "CUSTOMER") {
    return "Bu müşteriyi kaybetmemek için önce sahiplenme göstermeliyiz.";
  }

  if (decision.category === "SALES") {
    return "Satış fırsatı var; ama her talep sağlıklı büyüme demek değil.";
  }

  if (decision.category === "OPERATIONS") {
    return "Kapasite ve teslimat netleşmeden yeni taahhüt vermemeliyiz.";
  }

  if (decision.category === "PEOPLE") {
    return "Bu ekip meselesini acele hükümle değil, rol ve sistem ayrımıyla ele almalıyız.";
  }

  if (strategicProfile.confidence.level === "LOW") {
    return "Yeterli bağlam henüz tam değil; yine de bugün karar disiplinini kurabiliriz.";
  }

  return "Bugün sakin, net ve uygulanabilir bir yönetim kararı almalıyız.";
}

function translateDecisionTitle(decision: ExecutiveDecision): string {
  if (decision.category === "FINANCE") {
    return "Tahsilat ve nakit riski netleşmeden yeni finansal risk alma.";
  }

  if (decision.category === "CUSTOMER") {
    return "Stratejik müşteri için sahiplenme ve toparlama planı başlat.";
  }

  if (decision.category === "SALES") {
    return "Büyümeyi marj, müşteri kalitesi ve kapasite filtresinden geçir.";
  }

  if (decision.category === "OPERATIONS") {
    return "Kapasite darboğazı çözülmeden yeni teslimat taahhüdü verme.";
  }

  if (decision.category === "PEOPLE") {
    return "Performans düşüşünü kişi, rol, eğitim ve sistem ayrımıyla ele al.";
  }

  return sentenceCase(decision.title);
}

function buildWhyThisMatters(
  decision: ExecutiveDecision,
  input: BuildAIGeneralManagerBriefInput,
): string {
  if (decision.category === "FINANCE") {
    return "Çünkü nakit riski büyüdüğünde sorun sadece tahsilat olmaktan çıkar; yeni iş, müşteri ilişkisi ve şirketin hareket alanı aynı anda etkilenir.";
  }

  if (decision.category === "CUSTOMER") {
    return "Çünkü stratejik müşteri kaybı sadece bugünkü ciroyu değil, güveni, referansı ve tekrar satış ihtimalini de zedeler.";
  }

  if (decision.category === "SALES") {
    return "Çünkü sağlıklı büyüme, sadece daha fazla iş almak değil; doğru müşteri, doğru marj ve teslim edilebilir söz vermektir.";
  }

  if (decision.category === "OPERATIONS") {
    return "Çünkü operasyon kapasitesi net değilse satış başarısı bile teslimat riskine ve müşteri memnuniyetsizliğine dönüşebilir.";
  }

  if (decision.category === "PEOPLE") {
    return "Çünkü performans düşüşü bazen kişi problemi değil; rol, eğitim, kapasite veya yönetim sistemi problemidir.";
  }

  return input.assessment.summary || decision.expectedImpact;
}

function translateActions(decision: ExecutiveDecision): string[] {
  const categoryActions: Record<ExecutiveDecisionCategory, string[]> = {
    FINANCE: [
      "Bugün net tarih ve tutar içeren yazılı ödeme sözü al.",
      "Yeni iş, teslimat veya vade kararını ödeme planına bağla.",
      "Müşteri ilişkisini koru; ama belirsizliği kabul etme.",
    ],
    CUSTOMER: [
      "Müşteriyi sahiplenen sakin bir görüşme yap.",
      "Toparlanma planını, sorumlu kişiyi ve tarihi net söyle.",
      "Bir sonraki kontrol tarihini yazılı olarak teyit et.",
    ],
    SALES: [
      "Talebi müşteri kalitesi, marj ve kapasite filtresinden geçir.",
      "Düşük marjlı veya zayıf uyumlu işi acele kabul etme.",
      "En sağlıklı büyüme fırsatını sorumlu kişi ve tarih ile takip listesine al.",
    ],
    OPERATIONS: [
      "Darboğazın adını, sorumlu kişisini ve çözüm tarihini netleştir.",
      "Kapasite netleşmeden yeni teslimat sözü verme.",
      "Bugünkü işleri teslimat riski ve müşteri etkisine göre sırala.",
    ],
    PEOPLE: [
      "Personelle rol, beklenti ve performans görüşmesini yap.",
      "Eğitim, rol uyumu, sistem ve kapasite nedenlerini ayrı ayrı kontrol et.",
      "Net hedef ve takip tarihi olan kısa bir iyileştirme planı koy.",
    ],
    STRATEGY: [
      "Bugünkü en önemli hedefi tek cümleyle netleştir.",
      "Nakit, müşteri, ekip ve operasyon kısıtlarını aynı tabloda gör.",
      "Kararı kanıta bağla ve bir sonraki gözden geçirme tarihini belirle.",
    ],
    EXECUTION: [
      "Kararın sorumlu kişisini belirle.",
      "Bir sonraki adımı ve bitiş tarihini yaz.",
      "Takibi aynı gün içinde kapat veya yeni tarih ver.",
    ],
  };

  return uniqueStrings([
    ...categoryActions[decision.category],
    ...decision.recommendedActions.map(toTurkishAction),
  ]).slice(0, 3);
}

function translateRisks(
  decision: ExecutiveDecision,
  council: ExecutiveCouncil,
): string[] {
  const categoryRisks: Record<ExecutiveDecisionCategory, string[]> = {
    FINANCE: [
      "Ödeme netleşmeden yeni risk alırsan nakit baskısı büyüyebilir.",
      "Çok sert ton müşteri ilişkisini zedeleyebilir; çok yumuşak ton belirsizliği uzatır.",
    ],
    CUSTOMER: [
      "Sahiplenme gecikirse müşteri kaybı ve itibar riski artar.",
      "Operasyon kök nedeni çözülmeden verilen sözler güveni daha fazla zedeler.",
    ],
    SALES: [
      "Her talebi kabul etmek marjı ve teslimat kalitesini düşürebilir.",
      "Kapasite filtresi yoksa büyüme fırsatı operasyon krizine dönebilir.",
    ],
    OPERATIONS: [
      "Darboğaz çözülmeden yeni söz verilirse teslimat gecikmesi ve müşteri kaybı artar.",
      "Sorumlu kişi ve tarih net değilse sorun tekrar eder.",
    ],
    PEOPLE: [
      "Kişiye erken hüküm vermek doğru insanı kaybettirebilir.",
      "Sorun sistem kaynaklıysa sadece uyarma kalıcı sonuç vermez.",
    ],
    STRATEGY: [
      "Eksik stratejik bağlam kararı fazla temkinli veya fazla dağınık yapabilir.",
    ],
    EXECUTION: [
      "Sorumlu kişi ve tarih yoksa iyi karar takip edilmeyen niyete dönüşür.",
    ],
  };
  const councilRisks = council.risks
    .slice(0, 2)
    .map((risk) => translateCouncilRisk(risk.title));

  return uniqueStrings([...categoryRisks[decision.category], ...councilRisks]).slice(
    0,
    4,
  );
}

function buildFollowUp(decision: ExecutiveDecision): string {
  if (decision.followUpWindow === "today") {
    return "Bu kararın ilk kontrolünü bugün kapat.";
  }

  if (decision.followUpWindow === "within 48 hours") {
    return "Bu kararı 48 saat içinde yeniden kontrol et.";
  }

  if (decision.followUpWindow === "within 7 days") {
    return "Bu kararın sonucunu en geç 7 gün içinde yeniden değerlendir.";
  }

  return `Takip penceresi: ${decision.followUpWindow}.`;
}

function buildSayThisToday(decision: ExecutiveDecision): string {
  if (decision.category === "FINANCE") {
    return "Bu işi sizinle devam ettirmek istiyoruz; ama önce ödeme planını netleştirmemiz gerekiyor.";
  }

  if (decision.category === "CUSTOMER") {
    return "Bu ilişki bizim için değerli; bu yüzden konuyu sahipleniyoruz ve size net bir toparlanma planıyla döneceğiz.";
  }

  if (decision.category === "SALES") {
    return "Bu fırsatı değerlendirelim; ama marj, kapasite ve müşteri uyumu netleşmeden acele söz vermeyelim.";
  }

  if (decision.category === "OPERATIONS") {
    return "Kapasite netleşmeden yeni teslimat sözü vermiyoruz; önce darboğazı çözüyoruz.";
  }

  if (decision.category === "PEOPLE") {
    return "Bu düşüşü kişisel hata gibi değil, birlikte çözeceğimiz bir gelişim konusu olarak ele alalım.";
  }

  if (decision.category === "EXECUTION") {
    return "Bu kararın sorumlu kişisini, tarihini ve bir sonraki adımını bugün netleştirelim.";
  }

  return "Bugün dağılmadan tek karar, net sorumlu kişi ve net takip tarihiyle ilerleyelim.";
}

function decideTone(
  decision: ExecutiveDecision,
  strategicProfile: StrategicProfile,
): AIGeneralManagerTone {
  if (decision.priority === "CRITICAL" || decision.category === "FINANCE") {
    return "CAUTIONARY";
  }

  if (decision.category === "CUSTOMER" || decision.category === "PEOPLE") {
    return "SUPPORTIVE";
  }

  if (strategicProfile.confidence.level === "HIGH") {
    return "DIRECT";
  }

  return "CALM";
}

function buildSections(input: {
  primaryDecision: ExecutiveDecision;
  firstActions: string[];
  risksToWatch: string[];
  input: BuildAIGeneralManagerBriefInput;
}): AIGeneralManagerBriefSection[] {
  return [
    {
      id: "decision",
      title: "Yönetici kararı",
      body: translateDecisionTitle(input.primaryDecision),
      bullets: [translateExpectedImpact(input.primaryDecision)],
    },
    {
      id: "actions",
      title: "İlk aksiyonlar",
      body: "Bugün söylenmesi ve yapılması gerekenleri sade tutuyoruz.",
      bullets: input.firstActions,
    },
    {
      id: "risks",
      title: "Dikkat edilecek riskler",
      body: "Bu kararda asıl risk, belirsizliği uzatmak veya kontrolsüz risk almaktır.",
      bullets: input.risksToWatch,
    },
    {
      id: "context",
      title: "Bağlam ve güven",
      body: buildContextNote(input.input),
      bullets: input.input.strategicProfile.missingSignals
        .slice(0, 3)
        .map(translateMissingSignal),
    },
  ];
}

function translateExpectedImpact(decision: ExecutiveDecision): string {
  if (decision.category === "FINANCE") {
    return "Nakit kontrolü güçlenir ve yeni risk almadan önce şirketin hareket alanı korunur.";
  }

  if (decision.category === "CUSTOMER") {
    return "Müşteri güveni korunur, kayıp riski azalır ve ilişki daha kontrollü toparlanır.";
  }

  if (decision.category === "SALES") {
    return "Büyüme daha sağlıklı müşteriler, daha doğru marj ve daha gerçekçi kapasiteyle ilerler.";
  }

  if (decision.category === "OPERATIONS") {
    return "Teslimat güvenilirliği artar, kapasite baskısı görünür hale gelir ve yeni sözler daha kontrollü verilir.";
  }

  if (decision.category === "PEOPLE") {
    return "Ekip sürekliliği korunur ve performans sorunu daha adil, daha yönetilebilir hale gelir.";
  }

  if (decision.category === "EXECUTION") {
    return "Karar takip edilebilir hale gelir; sorumlu kişi, tarih ve sonuç netleşir.";
  }

  return "Karar daha net, takip edilebilir ve kanıta dayalı hale gelir.";
}

function buildContextNote(input: BuildAIGeneralManagerBriefInput): string {
  if (input.strategicProfile.confidence.level === "LOW") {
    return "Bazı bağlam sinyalleri eksik; bu yüzden karar uygulanabilir ama takipli ilerlemeli.";
  }

  if (input.council.confidence < 0.5) {
    return "Müdürler kurulunun görünürlüğü orta seviyenin altında; ilk aksiyonlardan sonra karar tekrar okunmalı.";
  }

  return "Mevcut sinyaller bu kararı destekliyor; yine de sonuç takip edilmeden karar tamamlanmış sayılmaz.";
}

function toTurkishAction(action: string): string {
  const normalized = action.toLocaleLowerCase("en");

  if (normalized.includes("written payment") || normalized.includes("payment")) {
    return "Ödeme planı yazılı hale gelmeden yeni risk alma.";
  }

  if (normalized.includes("owner") || normalized.includes("deadline")) {
    return "Sorumlu kişiyi ve tarihi netleştir.";
  }

  if (normalized.includes("capacity") || normalized.includes("delivery")) {
    return "Kapasite ve teslimat riskini netleştirmeden taahhüt verme.";
  }

  if (normalized.includes("customer") || normalized.includes("relationship")) {
    return "Müşteri ilişkisini koru ama netlikten taviz verme.";
  }

  if (normalized.includes("performance") || normalized.includes("training")) {
    return "Performans, eğitim ve rol uyumunu aynı görüşmede ayır.";
  }

  return normalizeUserFacingText(sentenceCase(action));
}

function translateCouncilRisk(title: string): string {
  const normalized = title.toLocaleLowerCase("en");

  if (normalized.includes("financial visibility")) {
    return "Nakit akışını yanlış okuma riski";
  }

  if (normalized.includes("operations visibility")) {
    return "Teslimat gecikmesini geç fark etme riski";
  }

  if (normalized.includes("follow-up foundation")) {
    return "Takip sisteminin yeterince güçlü olmaması";
  }

  if (normalized.includes("customer and sales visibility")) {
    return "Müşteri ve satış görünürlüğünün zayıf kalması";
  }

  if (normalized.includes("customer success visibility")) {
    return "Müşteri sağlığını geç fark etme riski";
  }

  if (normalized.includes("strategic customer retention")) {
    return "Stratejik müşteriyi kaybetme riski";
  }

  if (normalized.includes("people visibility")) {
    return "Ekip sorununu geç fark etme riski";
  }

  return normalizeUserFacingText(sentenceCase(title));
}

function translateMissingSignal(signal: string): string {
  const labels: Record<string, string> = {
    strategic_focus: "Stratejik öncelik net değil",
    top_goal: "Ana hedef net değil",
    cashflow_priority: "Nakit önceliği net değil",
    profitability_focus: "Kârlılık odağı net değil",
    primary_customer_type: "Ana müşteri tipi net değil",
    team_size: "Ekip büyüklüğü net değil",
    delivery_risk: "Teslimat riski net değil",
    risk_preference: "Risk alma tercihi net değil",
    management_preference: "Yönetim tarzı net değil",
  };

  return labels[signal] ?? normalizeUserFacingText(sentenceCase(signal));
}

function normalizeUserFacingText(value: string): string {
  return value
    .replaceAll("owner and deadline", "sorumlu kişi ve tarih")
    .replaceAll("Owner and deadline", "Sorumlu kişi ve tarih")
    .replaceAll("owner", "sorumlu kişi")
    .replaceAll("Owner", "Sorumlu kişi")
    .replaceAll("deadline", "tarih")
    .replaceAll("Deadline", "Tarih")
    .replaceAll("Bugunun", "Bugünün")
    .replaceAll("bugunun", "bugünün")
    .replaceAll("musteri", "müşteri")
    .replaceAll("Musteri", "Müşteri")
    .replaceAll("netles", "netleş")
    .replaceAll("oncelik", "öncelik")
    .replaceAll("Oncelik", "Öncelik")
    .replaceAll("satis", "satış")
    .replaceAll("Satis", "Satış")
    .replaceAll("tahsilat", "tahsilat");
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return trimmed;
  }

  return `${trimmed.charAt(0).toLocaleUpperCase("tr")}${trimmed.slice(1)}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
