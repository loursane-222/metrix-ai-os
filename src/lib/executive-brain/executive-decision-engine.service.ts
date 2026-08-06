import type {
  ExecutiveBrainAssessment,
  ExecutiveBrainContext,
  ExecutiveBrainImpact,
  ExecutiveBrainSeverity,
  ExecutiveCouncil,
  ExecutiveCouncilPriority,
  ExecutiveCouncilRecommendation,
  ExecutiveCouncilRisk,
  ExecutiveDecision,
  ExecutiveDecisionCategory,
  ExecutiveDecisionPackage,
  ExecutiveDecisionPriority,
  StrategicProfile,
} from "./executive-brain.types";

type DecisionCandidate = {
  id: string;
  title: string;
  category: ExecutiveDecisionCategory;
  priority: ExecutiveDecisionPriority;
  rationale: string;
  expectedImpact: string;
  recommendedActions: string[];
  risks: string[];
  followUpWindow: string;
  evidenceRefs: string[];
  confidence: number;
  sourceRank: number;
};

export function buildExecutiveDecisionPackage(
  context: ExecutiveBrainContext,
  assessment: ExecutiveBrainAssessment,
  council: ExecutiveCouncil,
  strategicProfile: StrategicProfile,
): ExecutiveDecisionPackage {
  const candidates = buildDecisionCandidates({
    context,
    assessment,
    council,
    strategicProfile,
  }).sort(compareDecisionCandidates);
  const primaryDecision =
    candidates[0] ?? buildFallbackDecision(assessment, council, strategicProfile);
  const supportingDecisions = candidates
    .filter((candidate) => candidate.id !== primaryDecision.id)
    .slice(0, 3)
    .map(toExecutiveDecision);
  const primary = toExecutiveDecision(primaryDecision);

  return {
    primaryDecision: primary,
    supportingDecisions,
    executiveSummary: buildExecutiveSummary(primary, supportingDecisions),
    confidence: calculatePackageConfidence(primary, supportingDecisions),
  };
}

function buildDecisionCandidates(input: {
  context: ExecutiveBrainContext;
  assessment: ExecutiveBrainAssessment;
  council: ExecutiveCouncil;
  strategicProfile: StrategicProfile;
}): DecisionCandidate[] {
  return [
    ...buildDomainSignalDecisions(input.context, input.strategicProfile),
    ...input.council.risks.map((risk) =>
      buildRiskDecision(risk, input.strategicProfile),
    ),
    ...input.council.priorities.map((priority) =>
      buildPriorityDecision(priority, input.strategicProfile),
    ),
    ...input.council.recommendations.map((recommendation) =>
      buildRecommendationDecision(recommendation, input.strategicProfile),
    ),
    ...buildStrategicGapDecisions(input.assessment, input.strategicProfile),
  ];
}

function buildRiskDecision(
  risk: ExecutiveCouncilRisk,
  strategicProfile: StrategicProfile,
): DecisionCandidate {
  const category = inferCategory(risk.title, risk.explanation);
  const priority = adjustPriorityForStrategy(
    priorityFromSeverity(risk.severity),
    category,
    strategicProfile,
  );

  return {
    id: `decision-risk-${risk.id}`,
    title: `${risk.title} riskini çöz`,
    category,
    priority,
    rationale: buildRationale(risk.explanation, strategicProfile),
    expectedImpact: buildExpectedImpact(category, priority, strategicProfile),
    confidence: calculateDecisionConfidence(
      risk.evidenceRefs.length,
      strategicProfile.confidence.score,
      risk.severity,
    ),
    recommendedActions: buildRecommendedActions({
      category,
      suggestedAction: risk.suggestedAction,
      strategicProfile,
    }),
    risks: buildDecisionRisks(category, strategicProfile),
    followUpWindow: followUpWindowForPriority(priority),
    evidenceRefs: risk.evidenceRefs,
    sourceRank: 0,
  };
}

function buildPriorityDecision(
  priority: ExecutiveCouncilPriority,
  strategicProfile: StrategicProfile,
): DecisionCandidate {
  const category = inferCategory(priority.title, priority.explanation);
  const decisionPriority = adjustPriorityForStrategy(
    priorityFromImpact(priority.impact),
    category,
    strategicProfile,
  );

  return {
    id: `decision-priority-${priority.id}`,
    title: priority.title,
    category,
    priority: decisionPriority,
    rationale: buildRationale(priority.explanation, strategicProfile),
    expectedImpact: buildExpectedImpact(category, decisionPriority, strategicProfile),
    confidence: calculateDecisionConfidence(
      priority.evidenceRefs.length,
      strategicProfile.confidence.score,
      priority.impact,
    ),
    recommendedActions: buildRecommendedActions({
      category,
      suggestedAction: priority.suggestedAction,
      strategicProfile,
    }),
    risks: buildDecisionRisks(category, strategicProfile),
    followUpWindow: followUpWindowForPriority(decisionPriority),
    evidenceRefs: priority.evidenceRefs,
    sourceRank: isContextGapText(priority.title, priority.explanation) ? 8 : 1,
  };
}

function buildRecommendationDecision(
  recommendation: ExecutiveCouncilRecommendation,
  strategicProfile: StrategicProfile,
): DecisionCandidate {
  const category = inferCategory(recommendation.title, recommendation.explanation);
  const priority = adjustPriorityForStrategy(
    priorityFromImpact(recommendation.impact),
    category,
    strategicProfile,
  );

  return {
    id: `decision-recommendation-${recommendation.id}`,
    title: recommendation.title,
    category,
    priority,
    rationale: buildRationale(recommendation.explanation, strategicProfile),
    expectedImpact: buildExpectedImpact(category, priority, strategicProfile),
    confidence: calculateDecisionConfidence(
      recommendation.evidenceRefs.length,
      strategicProfile.confidence.score,
      recommendation.impact,
    ),
    recommendedActions: buildRecommendedActions({
      category,
      suggestedAction: recommendation.suggestedAction,
      strategicProfile,
    }),
    risks: buildDecisionRisks(category, strategicProfile),
    followUpWindow: followUpWindowForPriority(priority),
    evidenceRefs: recommendation.evidenceRefs,
    sourceRank: isContextGapText(recommendation.title, recommendation.explanation)
      ? 9
      : 2,
  };
}

function buildDomainSignalDecisions(
  context: ExecutiveBrainContext,
  strategicProfile: StrategicProfile,
): DecisionCandidate[] {
  const decisions: DecisionCandidate[] = [];
  const financeText = signalText(context.financeSignals);
  const salesText = signalText(context.salesSignals);
  const customerText = signalText(context.customerSignals);
  const personnelText = signalText(context.personnelSignals);
  const operationsText = signalText(context.operationsSignals);
  const companyText = signalText(context.companySignals);
  const memoryText = signalText(context.memorySignals);

  if (
    hasAny(financeText, [
      "open_balance",
      "payment_delay",
      "cashflow",
      "collection",
      "tahsilat",
      "odeme",
      "gecikti",
      "acik bakiye",
      "nakit",
    ])
  ) {
    decisions.push({
      id: "decision-domain-finance-exposure",
      title: "Tahsilat netleşmeden yeni finansal risk alma",
      category: "FINANCE",
      priority: adjustPriorityForStrategy("HIGH", "FINANCE", strategicProfile),
      rationale:
        "Finans sinyalleri ödeme veya nakit riski gösteriyor. Yönetim kararı önce nakdi korumalı, ardından yeni ticari riskin kabul edilip edilemeyeceğini belirlemeli.",
      expectedImpact:
        "Tahsilat riskini azaltır ve müşteri ilişkisinin kontrolsüz bir nakit riskine dönüşmesini önler.",
      confidence: signalConfidence({
        primarySignals: context.financeSignals,
        supportingSignals: [
          ...(context.customerSignals ?? []),
          ...(context.salesSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.72,
      }),
      recommendedActions: [
        "Yeni risk almadan önce yazılı ödeme tarihi ve tutarı al.",
        "Yeni iş, teslimat veya kredi koşullarını teyit edilmiş bir ödeme planına bağla.",
        "İletişim tonunu sertleştirmeden önce müşteri ilişkisinin değerini ve nakit baskısını birlikte değerlendir.",
      ],
      risks: buildDecisionRisks("FINANCE", strategicProfile),
      followUpWindow: "48 saat içinde",
      evidenceRefs: evidenceRefsFromContext(context, [
        "finance",
        "customer",
        "sales",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  if (
    hasAny(`${salesText} ${companyText} ${memoryText}`, [
      "pipeline",
      "lead",
      "quote",
      "yeni musteri",
      "growth",
      "buyume",
      "strategic_focus",
      "top_goal",
    ])
  ) {
    decisions.push({
      id: "decision-domain-qualified-growth",
      title: "Marj ve kapasite filtresiyle buyume kararini ver",
      category: "SALES",
      priority: adjustPriorityForStrategy("HIGH", "SALES", strategicProfile),
      rationale:
        "Büyüme sinyalleri görünür durumda; ancak yönetim büyüme kararını marj, müşteri kalitesi ve teslimat kapasitesiyle elemelidir.",
      expectedImpact:
        "Talebi, marja veya teslimat güvenilirliğine zarar verebilecek hacim yerine daha sağlıklı büyümeye dönüştürür.",
      confidence: signalConfidence({
        primarySignals: [...(context.salesSignals ?? []), ...(context.companySignals ?? [])],
        supportingSignals: [
          ...(context.financeSignals ?? []),
          ...(context.operationsSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.68,
      }),
      recommendedActions: [
        "Nitelikli talebi düşük marjlı veya uyumsuz talepten ayır.",
        "Daha fazla iş almadan önce marj ve teslimat kapasitesi filtrelerini belirle.",
        "Mevcut büyüme ve kârlılık yaklaşımına uyan müşterilere öncelik ver.",
      ],
      risks: buildDecisionRisks("SALES", strategicProfile),
      followUpWindow: "48 saat içinde",
      evidenceRefs: evidenceRefsFromContext(context, [
        "sales",
        "company",
        "finance",
        "operations",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  if (
    hasAny(operationsText, [
      "capacity",
      "kapasite",
      "bottleneck",
      "darbogaz",
      "delivery_risk",
      "delivery",
      "teslimat",
    ])
  ) {
    decisions.push({
      id: "decision-domain-capacity-bottleneck",
      title: "Kapasite darbogazi cozulmeden yeni teslimat taahhudu verme",
      category: "OPERATIONS",
      priority: adjustPriorityForStrategy("HIGH", "OPERATIONS", strategicProfile),
      rationale:
        "Operasyon sinyalleri teslimat, kapasite veya darboğaz baskısı gösteriyor. Yeni taahhütler şirketin güvenilir teslimat kapasitesinden daha hızlı büyümemeli.",
      expectedImpact:
        "Teslimat güvenilirliğini korur ve aşırı taahhüt nedeniyle müşteri ilişkilerine zarar verme riskini azaltır.",
      confidence: signalConfidence({
        primarySignals: context.operationsSignals,
        supportingSignals: [
          ...(context.salesSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.74,
      }),
      recommendedActions: [
        "Darboğazın sahibi ve çözüm tarihi netleşene kadar yeni teslimat sözlerini durdur veya sıraya al.",
        "Operasyonel kısıtı, sahibini, kapasite sınırını ve toparlanma tarihini belirle.",
        "Yeni işi yalnızca teslimat kapasitesi ve kalite riski kontrol altında kalıyorsa kabul et.",
      ],
      risks: buildDecisionRisks("OPERATIONS", strategicProfile),
      followUpWindow: "48 saat içinde",
      evidenceRefs: evidenceRefsFromContext(context, [
        "operations",
        "sales",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  if (
    hasAny(personnelText, [
      "performance",
      "performans",
      "training",
      "egitim",
      "role",
      "rol",
      "team_size",
      "ekip",
    ])
  ) {
    decisions.push({
      id: "decision-domain-people-performance",
      title: "Performans dususunu kisi rol egitim ve sistem ayrimiyla ele al",
      category: "PEOPLE",
      priority: adjustPriorityForStrategy("HIGH", "PEOPLE", strategicProfile),
      rationale:
        "İnsan sinyalleri performans veya rol uyumu baskısı gösteriyor. Sağlıklı bir insan kararı, konuyu büyütmeden önce kişi, rol, eğitim, sistem ve teslimat etkisini birbirinden ayırmalıdır.",
      expectedImpact:
        "Erken bir insan kararı alma olasılığını azaltırken ekip sürekliliğini güçlendirir.",
      confidence: signalConfidence({
        primarySignals: context.personnelSignals,
        supportingSignals: [
          ...(context.operationsSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.72,
      }),
      recommendedActions: [
        "Rol uyumu, eğitim ihtiyacı ve beklenen çıktı üzerine yapılandırılmış bir performans görüşmesi yap.",
        "Çalışanla ilgili konuyu süreç, kapasite ve yönetim sistemi nedenlerinden ayır.",
        "Daha sert bir insan kararı almadan önce tarihli bir gelişim planı belirle.",
      ],
      risks: buildDecisionRisks("PEOPLE", strategicProfile),
      followUpWindow: "7 gün içinde",
      evidenceRefs: evidenceRefsFromContext(context, [
        "personnel",
        "operations",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  if (
    hasAny(customerText, [
      "retention",
      "kayip",
      "unhappy",
      "memnun",
      "strategic customer",
      "stratejik musteri",
      "relationship",
      "iliski",
    ])
  ) {
    decisions.push({
      id: "decision-domain-customer-retention",
      title: "Stratejik musteriyi kaybetmemek icin sahiplenme plani baslat",
      category: "CUSTOMER",
      priority: adjustPriorityForStrategy("HIGH", "CUSTOMER", strategicProfile),
      rationale:
        "Müşteri sinyalleri elde tutma veya ilişki riski gösteriyor. Yönetim kararı, teslimat ve operasyon kök nedenini düzeltirken müşteri hesabını korumalıdır.",
      expectedImpact:
        "Hizmet toparlanma planına net sahiplik kazandırırken stratejik geliri, güveni ve itibarı korur.",
      confidence: signalConfidence({
        primarySignals: context.customerSignals,
        supportingSignals: [
          ...(context.operationsSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.72,
      }),
      recommendedActions: [
        "Stratejik müşteriyi mazeretlerle değil, sorumluluğu üstlenerek ara.",
        "Toparlanma aksiyonunu, sahibini, son tarihini ve sonraki takip tarihini açıkla.",
        "Yeni sözler vermeden önce teslimat sorununun kök nedenini düzelt.",
      ],
      risks: buildDecisionRisks("CUSTOMER", strategicProfile),
      followUpWindow: "48 saat içinde",
      evidenceRefs: evidenceRefsFromContext(context, [
        "customer",
        "operations",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  return decisions;
}

function buildStrategicGapDecisions(
  assessment: ExecutiveBrainAssessment,
  strategicProfile: StrategicProfile,
): DecisionCandidate[] {
  if (strategicProfile.missingSignals.length <= 4) {
    return [];
  }

  return [
    {
      id: "decision-establish-strategic-context",
      title: "Stratejik karar kalitesini artirmak icin eksik sinyalleri tamamla",
      category: "STRATEGY",
      priority: "MEDIUM",
      rationale:
        "Stratejik profilde çok fazla eksik sinyal var; bu nedenle yönetim kararları önce strateji görünürlüğünü artırmalıdır.",
      expectedImpact:
        "Büyüme, risk, finans, müşteri, insan ve operasyon tercihlerini netleştirerek gelecekteki karar kalitesini artırır.",
      confidence: roundToTwoDecimals(
        Math.max(0.15, Math.min(0.75, assessment.visibility.memoryVisibility.confidence)),
      ),
      recommendedActions: [
        "Mevcut en önemli hedefi kaydet.",
        "Nakit, büyüme, müşteri, insan ve operasyon önceliklerini netleştir.",
        "Gelecekteki kararları kanıta dayalı strateji sinyallerine bağla.",
      ],
      risks: [
        "Strateji kanıtları güçlenene kadar kararlar temkinli kalabilir.",
        "Davranışlarla doğrulanmayan stratejik varsayımlar hatalı olabilir.",
      ],
      followUpWindow: "7 gün içinde",
      evidenceRefs: strategicProfile.evidence.map((item) => item.id),
      sourceRank: 20,
    },
  ];
}

function buildFallbackDecision(
  assessment: ExecutiveBrainAssessment,
  council: ExecutiveCouncil,
  strategicProfile: StrategicProfile,
): DecisionCandidate {
  return {
    id: "decision-build-executive-context",
    title: "Asgari yönetim görünürlüğünü tamamla",
    category: "STRATEGY",
    priority: "MEDIUM",
    rationale:
      council.findings[0]?.explanation ??
      assessment.summary ??
      "Daha güçlü bir yönetim kararı seçmek için yeterli yönetici bağlamı bulunmuyor.",
    expectedImpact:
      "Görünürlüğü artırıp desteksiz varsayımları azaltarak bir sonraki yönetim kararını iyileştirir.",
    confidence: roundToTwoDecimals(
      Math.max(0.1, Math.min(0.55, strategicProfile.confidence.score)),
    ),
    recommendedActions: [
      "Şirketin en önemli hedefini netleştir.",
      "Nakit, müşteri, insan ve operasyon kısıtlarını kaydet.",
      "Daha fazla sinyal oluştuğunda bir sonraki kararı yeniden değerlendir.",
    ],
    risks: [
      "Kanıtlar sınırlıyken karar kalitesi de sınırlı kalır.",
      "Bağlam güçlenene kadar sistem temkinli kalabilir.",
    ],
    followUpWindow: "7 gün içinde",
    evidenceRefs: strategicProfile.evidence.map((item) => item.id),
    sourceRank: 99,
  };
}

function buildRationale(
  explanation: string,
  strategicProfile: StrategicProfile,
): string {
  if (strategicProfile.confidence.level === "LOW") {
    return `${explanation} Stratejik profil güveni düşük olduğu için bu karar temkinli bir öneri olarak ele alınmalıdır.`;
  }

  return `${explanation} Stratejik profil, ${strategicProfile.growthStrategy} büyüme yaklaşımına ve ${strategicProfile.financialStrategy} finansal yaklaşımına işaret ediyor.`;
}

function buildExpectedImpact(
  category: ExecutiveDecisionCategory,
  priority: ExecutiveDecisionPriority,
  strategicProfile: StrategicProfile,
): string {
  if (category === "FINANCE") {
    return strategicProfile.riskTolerance === "low"
      ? "Yeni risk almadan önce nakit görünürlüğünü korur ve finansal riski azaltır."
      : "Kontrollü ticari aksiyon alanını korurken nakit kontrolünü güçlendirir.";
  }

  if (category === "SALES" || category === "CUSTOMER") {
    return strategicProfile.growthStrategy === "profitability_first_growth"
      ? "Marj kalitesini korurken ticari odağı güçlendirir."
      : "Daha iyi büyüme kararları için müşteri ve gelir görünürlüğünü artırır.";
  }

  if (category === "OPERATIONS") {
    return "Teslimat güvenilirliğini, kapasite görünürlüğünü ve uygulama kontrolünü güçlendirir.";
  }

  if (category === "PEOPLE") {
    return "Ekip kapasitesi görünürlüğünü artırır ve insan sürekliliği riskini azaltır.";
  }

  return priority === "CRITICAL"
    ? "Yönetici düzeyinde karar alınmasını sağlayarak acil yönetim riskini azaltır."
    : "Yönetim netliğini artırır ve bir sonraki daha nitelikli kararı hazırlar.";
}

function buildRecommendedActions(input: {
  category: ExecutiveDecisionCategory;
  suggestedAction: string;
  strategicProfile: StrategicProfile;
}): string[] {
  const baseActions = [input.suggestedAction];

  if (input.category === "FINANCE") {
    return input.strategicProfile.riskTolerance === "high"
      ? [
          ...baseActions,
          "Büyüme seçeneklerini açık tut, ancak kabul edilebilir azami nakit riskini belirle.",
          "Bir sonraki tahsilat veya nakit akışı sinyalinden sonra bu kararı gözden geçir.",
        ]
      : [
          ...baseActions,
          "Nakit veya ödeme koşulları netleşene kadar riski artırma.",
          "Yazılı ödeme veya nakit akışı kanıtı oluştuğunda bu kararı gözden geçir.",
        ];
  }

  if (input.category === "SALES" || input.category === "CUSTOMER") {
    return input.strategicProfile.financialStrategy === "profitability_first"
      ? [
          ...baseActions,
          "Büyüme hacmini artırmadan önce marjı koru.",
          "Stratejik müşterileri düşük kaliteli talepten ayır.",
        ]
      : [
          ...baseActions,
          "Bu kararı satış hattı veya müşteri ilişkisi görünürlüğünü artırmak için kullan.",
          "Bir sonraki ticari taahhüdü ve sahibini belirle.",
        ];
  }

  if (input.category === "OPERATIONS") {
    return [
      ...baseActions,
      "Operasyonel kısıt için bir sorumlu ve son tarih belirle.",
      "Kapasite netleşene kadar yeni işin bekleyip beklememesi gerektiğini kontrol et.",
    ];
  }

  if (input.category === "PEOPLE") {
    return [
      ...baseActions,
      "Kişi, rol, eğitim ve kapasite nedenlerini birbirinden ayır.",
      "İnsan kararı için bir takip tarihi belirle.",
    ];
  }

  return [
    ...baseActions,
    "Sorumluyu, sonraki adımı ve gözden geçirme tarihini yazılı hale getir.",
  ];
}

function buildDecisionRisks(
  category: ExecutiveDecisionCategory,
  strategicProfile: StrategicProfile,
): string[] {
  const risks = ["Bu yalnızca bir öneridir; hiçbir aksiyon otomatik uygulanmaz."];

  if (strategicProfile.confidence.level === "LOW") {
    risks.push("Stratejik profil güveni düşük olduğu için varsayımlar değişebilir.");
  }

  if (category === "FINANCE") {
    risks.push(
      strategicProfile.riskTolerance === "high"
        ? "Sınırlar açık değilse yüksek risk toleransı nakit riskini gizleyebilir."
        : "Tüm riskler engellenirse düşük risk toleransı büyümeyi yavaşlatabilir.",
    );
  }

  if (category === "SALES" || category === "CUSTOMER") {
    risks.push(
      strategicProfile.growthStrategy === "profitability_first_growth"
        ? "Sıkı marj koruması kısa vadeli satış dönüşümünü azaltabilir."
        : "Kontrol edilmezse büyüme odağı operasyonel veya nakit riskini artırabilir.",
    );
  }

  return risks;
}

function inferCategory(title: string, explanation: string): ExecutiveDecisionCategory {
  const text = normalizeText(`${title} ${explanation}`);

  if (hasAny(text, ["cash", "collection", "finance", "payment", "margin", "receivable"])) {
    return "FINANCE";
  }

  if (hasAny(text, ["sales", "revenue", "pipeline", "quote", "pricing"])) {
    return "SALES";
  }

  if (hasAny(text, ["customer", "account", "relationship"])) {
    return "CUSTOMER";
  }

  if (hasAny(text, ["delivery", "operations", "capacity", "process", "execution"])) {
    return "OPERATIONS";
  }

  if (hasAny(text, ["people", "team", "employee", "hiring", "performance"])) {
    return "PEOPLE";
  }

  if (hasAny(text, ["follow-up", "memory", "decision", "coordination"])) {
    return "EXECUTION";
  }

  return "STRATEGY";
}

function adjustPriorityForStrategy(
  priority: ExecutiveDecisionPriority,
  category: ExecutiveDecisionCategory,
  strategicProfile: StrategicProfile,
): ExecutiveDecisionPriority {
  if (category === "FINANCE" && strategicProfile.riskTolerance === "low") {
    return raisePriority(priority);
  }

  if (
    (category === "SALES" || category === "CUSTOMER") &&
    strategicProfile.growthStrategy === "profitability_first_growth"
  ) {
    return lowerPriority(priority);
  }

  if (
    (category === "SALES" || category === "CUSTOMER") &&
    strategicProfile.riskTolerance === "high"
  ) {
    return raisePriority(priority);
  }

  if (
    category === "OPERATIONS" &&
    strategicProfile.growthStrategy === "operational_capacity_first"
  ) {
    return raisePriority(priority);
  }

  return priority;
}

function priorityFromSeverity(
  severity: ExecutiveBrainSeverity,
): ExecutiveDecisionPriority {
  if (severity === "CRITICAL") {
    return "CRITICAL";
  }

  if (severity === "HIGH") {
    return "HIGH";
  }

  if (severity === "MEDIUM") {
    return "MEDIUM";
  }

  return "LOW";
}

function priorityFromImpact(impact: ExecutiveBrainImpact): ExecutiveDecisionPriority {
  if (impact === "HIGH") {
    return "HIGH";
  }

  if (impact === "MEDIUM") {
    return "MEDIUM";
  }

  return "LOW";
}

function raisePriority(priority: ExecutiveDecisionPriority): ExecutiveDecisionPriority {
  const next: Record<ExecutiveDecisionPriority, ExecutiveDecisionPriority> = {
    LOW: "MEDIUM",
    MEDIUM: "HIGH",
    HIGH: "CRITICAL",
    CRITICAL: "CRITICAL",
  };

  return next[priority];
}

function lowerPriority(priority: ExecutiveDecisionPriority): ExecutiveDecisionPriority {
  const next: Record<ExecutiveDecisionPriority, ExecutiveDecisionPriority> = {
    LOW: "LOW",
    MEDIUM: "LOW",
    HIGH: "MEDIUM",
    CRITICAL: "HIGH",
  };

  return next[priority];
}

function followUpWindowForPriority(priority: ExecutiveDecisionPriority): string {
  if (priority === "CRITICAL") {
    return "bugün";
  }

  if (priority === "HIGH") {
    return "48 saat içinde";
  }

  if (priority === "MEDIUM") {
    return "7 gün içinde";
  }

  return "14 gün içinde";
}

function calculateDecisionConfidence(
  evidenceCount: number,
  strategicConfidence: number,
  strength: ExecutiveBrainSeverity | ExecutiveBrainImpact,
): number {
  const strengthScore =
    strength === "CRITICAL" || strength === "HIGH"
      ? 0.25
      : strength === "MEDIUM"
        ? 0.15
        : 0.05;

  return roundToTwoDecimals(
    Math.max(
      0.1,
      Math.min(0.95, evidenceCount * 0.05 + strategicConfidence * 0.45 + strengthScore),
    ),
  );
}

function calculatePackageConfidence(
  primaryDecision: ExecutiveDecision,
  supportingDecisions: ExecutiveDecision[],
): number {
  if (supportingDecisions.length === 0) {
    return primaryDecision.confidence;
  }

  const total =
    primaryDecision.confidence +
    supportingDecisions.reduce((sum, decision) => sum + decision.confidence, 0);

  return roundToTwoDecimals(total / (supportingDecisions.length + 1));
}

function compareDecisionCandidates(
  left: DecisionCandidate,
  right: DecisionCandidate,
): number {
  return (
    priorityRank(right.priority) - priorityRank(left.priority) ||
    right.confidence - left.confidence ||
    left.sourceRank - right.sourceRank ||
    left.title.localeCompare(right.title, "en")
  );
}

function priorityRank(priority: ExecutiveDecisionPriority): number {
  const ranks: Record<ExecutiveDecisionPriority, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };

  return ranks[priority];
}

function isContextGapText(title: string, explanation: string): boolean {
  const text = normalizeText(`${title} ${explanation}`);

  return hasAny(text, [
    "visibility",
    "context",
    "signals",
    "gorunurluk",
    "sinyal",
    "clarify",
    "build",
    "create",
    "prepare",
  ]);
}

function signalText(signals: ExecutiveBrainContext["financeSignals"]): string {
  return (signals ?? [])
    .map((signal) => `${signal.key ?? ""} ${signal.value ?? ""} ${signal.text ?? ""}`)
    .join(" ")
    .toLocaleLowerCase("en");
}

function evidenceRefsFromContext(
  context: ExecutiveBrainContext,
  domains: Array<
    "company" | "customer" | "finance" | "memory" | "operations" | "personnel" | "sales"
  >,
): string[] {
  const signalsByDomain: Record<
    "company" | "customer" | "finance" | "memory" | "operations" | "personnel" | "sales",
    ExecutiveBrainContext["financeSignals"]
  > = {
    company: context.companySignals,
    customer: context.customerSignals,
    finance: context.financeSignals,
    memory: context.memorySignals,
    operations: context.operationsSignals,
    personnel: context.personnelSignals,
    sales: context.salesSignals,
  };

  return uniqueStrings(
    domains.flatMap((domain) =>
      (signalsByDomain[domain] ?? []).map(
        (signal) =>
          signal.evidenceRef ??
          signal.id ??
          `context:${domain}:${signal.key ?? "signal"}`,
      ),
    ),
  );
}

function signalConfidence(input: {
  primarySignals?: ExecutiveBrainContext["financeSignals"];
  supportingSignals?: ExecutiveBrainContext["financeSignals"];
  strategicProfile: StrategicProfile;
  base: number;
}): number {
  const primaryCount = input.primarySignals?.length ?? 0;
  const supportingCount = input.supportingSignals?.length ?? 0;
  const evidenceBoost = Math.min(0.12, primaryCount * 0.03 + supportingCount * 0.01);
  const strategicBoost = input.strategicProfile.confidence.score * 0.08;

  return roundToTwoDecimals(
    Math.max(0.2, Math.min(0.95, input.base + evidenceBoost + strategicBoost)),
  );
}

function toExecutiveDecision(candidate: DecisionCandidate): ExecutiveDecision {
  return {
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    priority: candidate.priority,
    rationale: candidate.rationale,
    expectedImpact: candidate.expectedImpact,
    confidence: candidate.confidence,
    recommendedActions: candidate.recommendedActions,
    risks: candidate.risks,
    followUpWindow: candidate.followUpWindow,
    evidenceRefs: candidate.evidenceRefs,
  };
}

function buildExecutiveSummary(
  primaryDecision: ExecutiveDecision,
  supportingDecisions: ExecutiveDecision[],
): string {
  return `Bugünün birincil yönetim kararı: ${primaryDecision.title}. Önceliği ${primaryDecision.priority}; ${supportingDecisions.length} destekleyici karar bulunuyor.`;
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("en").trim();
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
