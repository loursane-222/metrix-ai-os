import type {
  RecognitionDomain,
  RecognitionDomainCoverage,
  RecognitionMemoryKey,
  RecognitionOpportunity,
  RecognitionSnapshot,
  RecognitionSnapshotField,
} from "./recognition-snapshot.types";

const DOMAIN_PRIORITY_ORDER: RecognitionDomain[] = [
  "PERSONAL",
  "FAMILY",
  "WORKING_STYLE",
  "CALENDAR_BEHAVIOR",
  "DECISION_STYLE",
  "INTERESTS",
  "BUSINESS",
  "GOALS",
  "CUSTOMERS",
  "TEAM",
  "FINANCE",
  "COMMUNICATION_STYLE",
  "LIFESTYLE",
];

const OPPORTUNITY_PRIORITY_ORDER: RecognitionSnapshotField[] = [
  "industry",
  "top_goal",
  "primary_customer_type",
  "city",
  "team_size",
  "strategic_focus",
];

const OPPORTUNITY_COPY: Record<RecognitionMemoryKey, RecognitionOpportunity> = {
    industry: {
      key: "industry",
      priority: "HIGH",
      reason: "Sektör bilinmeden operasyon ve benchmark önerileri zayıf kalır.",
      suggestedQuestion: "Hangi sektörde faaliyet gösteriyorsunuz?",
    },
    top_goal: {
      key: "top_goal",
      priority: "HIGH",
      reason: "Ana hedef bilinmeden karar desteği doğru önceliğe bağlanamaz.",
      suggestedQuestion: "Şu anda işletmen için en önemli hedef nedir?",
    },
    primary_customer_type: {
      key: "primary_customer_type",
      priority: "HIGH",
      reason: "Müşteri tipi bilinmeden satış, tahsilat ve hizmet önerileri netleşmez.",
      suggestedQuestion: "En çok hangi müşteri tipine hizmet veriyorsunuz?",
    },
    city: {
      key: "city",
      priority: "MEDIUM",
      reason: "Şehir bilinmeden yerel pazar ve operasyon bağlamı eksik kalır.",
      suggestedQuestion: "İşletmeniz ağırlıklı olarak hangi şehirde faaliyet gösteriyor?",
    },
    team_size: {
      key: "team_size",
      priority: "MEDIUM",
      reason: "Ekip büyüklüğü bilinmeden görev, ritim ve yönetim önerileri eksik kalır.",
      suggestedQuestion: "Ekibiniz şu anda kaç kişiden oluşuyor?",
    },
    strategic_focus: {
      key: "strategic_focus",
      priority: "MEDIUM",
      reason: "Stratejik odak bilinmeden öneriler işletmenin gerçek yönüne bağlanamaz.",
      suggestedQuestion: "Şu anda en çok hangi stratejik odağa yoğunlaşıyorsunuz?",
    },
    cashflow_priority: {
      key: "cashflow_priority",
      priority: "MEDIUM",
      reason: "Nakit akışı önceliği bilinmeden finans önerileri eksik kalır.",
      suggestedQuestion: "Nakit akışında şu anda en önemli önceliğiniz nedir?",
    },
    profitability_focus: {
      key: "profitability_focus",
      priority: "MEDIUM",
      reason: "Karlılık odağı bilinmeden büyüme ve maliyet kararları netleşmez.",
      suggestedQuestion: "Karlılığı artırmak için şu anda en çok neye odaklanıyorsunuz?",
    },
    personal_preference: {
      key: "personal_preference",
      priority: "HIGH",
      reason: "Kişisel tercihlerin bilinmeden öneri dili ve çalışma şekli yeterince uyarlanamaz.",
      suggestedQuestion: "Sizinle çalışırken özellikle dikkat etmemi istediğiniz bir tercih var mı?",
    },
    personal_interest: {
      key: "personal_interest",
      priority: "HIGH",
      reason: "Kişisel ilgi alanları bilinmeden insan bağlamı eksik kalır.",
      suggestedQuestion: "İş dışında ilgi duyduğunuz konular neler?",
    },
    family_member: {
      key: "family_member",
      priority: "HIGH",
      reason: "Aile bağlamı bilinmeden önemli kişisel öncelikler eksik kalabilir.",
      suggestedQuestion: "Ailenizde sizin için özellikle önemli olan kişiler kimler?",
    },
    family_important_date: {
      key: "family_important_date",
      priority: "HIGH",
      reason: "Önemli aile tarihleri bilinmeden kişisel takvim bağlamı eksik kalır.",
      suggestedQuestion: "Hatırlamamı isteyeceğiniz önemli aile tarihleri var mı?",
    },
    lifestyle_preference: {
      key: "lifestyle_preference",
      priority: "LOW",
      reason: "Yaşam tarzı tercihleri bilinmeden öneriler kişisel ritme tam uymaz.",
      suggestedQuestion: "Günlük yaşam ritminizle ilgili bilmemi istediğiniz bir tercih var mı?",
    },
    favorite_team: {
      key: "favorite_team",
      priority: "MEDIUM",
      reason: "Takip ettiğiniz takım bilinmeden kişisel ilgi bağlamı eksik kalır.",
      suggestedQuestion: "Tuttuğunuz veya takip ettiğiniz bir takım var mı?",
    },
    hobby: {
      key: "hobby",
      priority: "MEDIUM",
      reason: "Hobiler bilinmeden kişisel ilgi alanı bağlamı eksik kalır.",
      suggestedQuestion: "Düzenli yaptığınız veya sevdiğiniz hobiler neler?",
    },
    music_preference: {
      key: "music_preference",
      priority: "MEDIUM",
      reason: "Müzik tercihi kişisel ilgi bağlamını daha iyi tamamlar.",
      suggestedQuestion: "En çok hangi müzik türlerini dinlersiniz?",
    },
    work_preference: {
      key: "work_preference",
      priority: "HIGH",
      reason: "Çalışma tercihiniz bilinmeden iş ritmi önerileri yeterince uyarlanamaz.",
      suggestedQuestion: "Nasıl çalışmayı tercih edersiniz?",
    },
    stress_behavior: {
      key: "stress_behavior",
      priority: "HIGH",
      reason: "Stres davranışı bilinmeden yoğun dönemlerde doğru destek vermek zorlaşır.",
      suggestedQuestion: "Yoğun veya stresli dönemlerde sizi en iyi ne rahatlatır?",
    },
    calendar_preference: {
      key: "calendar_preference",
      priority: "HIGH",
      reason: "Takvim tercihi bilinmeden uygun ritim ve hatırlatma önerileri zayıf kalır.",
      suggestedQuestion: "Takvim ve hatırlatmalar konusunda nasıl bir düzen tercih edersiniz?",
    },
    unavailable_pattern: {
      key: "unavailable_pattern",
      priority: "HIGH",
      reason: "Uygun olmadığınız zamanlar bilinmeden planlama önerileri aksayabilir.",
      suggestedQuestion: "Genelde hangi zamanlarda uygun olmazsınız?",
    },
    decision_preference: {
      key: "decision_preference",
      priority: "HIGH",
      reason: "Karar alma tercihiniz bilinmeden karar desteği doğru formatta sunulamaz.",
      suggestedQuestion: "Karar alırken nasıl bir bilgi formatı size daha çok yardımcı olur?",
    },
    communication_preference: {
      key: "communication_preference",
      priority: "LOW",
      reason: "İletişim tercihi bilinmeden yanıt tonu ve detay seviyesi tam uyarlanamaz.",
      suggestedQuestion: "Size nasıl bir iletişim diliyle yanıt vermemi tercih edersiniz?",
    },
};

export function findRecognitionOpportunity(
  snapshot: RecognitionSnapshot,
): RecognitionOpportunity | null {
  const domainOpportunity = snapshot.domainCoverage
    ? findDomainBasedOpportunity(snapshot.domainCoverage)
    : null;

  if (domainOpportunity) {
    return domainOpportunity;
  }

  const unknownFields = new Set(snapshot.unknown);
  const opportunityKey = OPPORTUNITY_PRIORITY_ORDER.find((field) =>
    unknownFields.has(field),
  );

  return opportunityKey ? OPPORTUNITY_COPY[opportunityKey] : null;
}

function findDomainBasedOpportunity(
  domainCoverage: RecognitionDomainCoverage[],
): RecognitionOpportunity | null {
  const unknownOpportunity = findOpportunityByDomainStatus(
    domainCoverage,
    "UNKNOWN",
  );

  if (unknownOpportunity) {
    return unknownOpportunity;
  }

  return findOpportunityByDomainStatus(domainCoverage, "PARTIAL");
}

function findOpportunityByDomainStatus(
  domainCoverage: RecognitionDomainCoverage[],
  status: RecognitionDomainCoverage["status"],
): RecognitionOpportunity | null {
  for (const domain of DOMAIN_PRIORITY_ORDER) {
    const coverage = domainCoverage.find(
      (item) => item.domain === domain && item.status === status,
    );
    const opportunity = findOpportunityForCoverage(coverage);

    if (opportunity) {
      return opportunity;
    }
  }

  return null;
}

function findOpportunityForCoverage(
  coverage: RecognitionDomainCoverage | undefined,
): RecognitionOpportunity | null {
  const key = coverage?.unknownKeys.find(isKnownOpportunityKey);

  return key ? OPPORTUNITY_COPY[key] : null;
}

function isKnownOpportunityKey(key: string): key is RecognitionMemoryKey {
  return key in OPPORTUNITY_COPY;
}
