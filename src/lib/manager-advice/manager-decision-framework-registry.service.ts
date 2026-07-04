import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";
import type { ManagerDecisionFramework } from "./manager-decision-framework.types";

const MANAGER_DECISION_FRAMEWORKS: ManagerDecisionFramework[] = [
  {
    frameworkId: "pricing_decision_v1",
    category: "PRICING",
    title: "Fiyat Kararı Çerçevesi",
    description:
      "Fiyat, indirim ve teklif kararlarında stratejik değer, marj ve alternatifleri birlikte düşünmek için kullanılır.",
    steps: [
      {
        order: 1,
        question: "Müşteri stratejik mi?",
        reason: "Stratejik müşteri ilişkileri kısa vadeli fiyat kararından daha yüksek değer taşıyabilir.",
      },
      {
        order: 2,
        question: "Rakip farkı ne kadar?",
        reason: "Fiyat farkının gerçek rekabet baskısı mı yoksa algı mı olduğunu ayırmak gerekir.",
      },
      {
        order: 3,
        question: "Mevcut marj korunuyor mu?",
        reason: "Marj korunmadan verilen indirim büyüme yerine zarar üretebilir.",
      },
      {
        order: 4,
        question: "Nakit ihtiyacı var mı?",
        reason: "Kısa vadeli nakit ihtiyacı fiyat esnekliğini değiştirebilir.",
      },
      {
        order: 5,
        question: "İndirim dışında seçenek var mı?",
        reason: "Vade, kapsam, hizmet seviyesi veya paketleme fiyatı düşürmeden değer yaratabilir.",
      },
      {
        order: 6,
        question: "İşi kaybetmenin maliyeti nedir?",
        reason: "Kaybedilen işin ciro, referans ve kapasite etkisi kararın gerçek maliyetini belirler.",
      },
    ],
  },
  {
    frameworkId: "collection_decision_v1",
    category: "COLLECTION",
    title: "Tahsilat Kararı Çerçevesi",
    description:
      "Tahsilat kararlarında risk, ilişki değeri ve ödeme planı seçeneklerini birlikte değerlendirmek için kullanılır.",
    steps: [
      {
        order: 1,
        question: "Müşteri ödeme alışkanlığı nasıl?",
        reason: "Geçmiş ödeme davranışı tahsilat riskinin en güçlü erken sinyallerinden biridir.",
      },
      {
        order: 2,
        question: "Toplam risk tutarı nedir?",
        reason: "Risk tutarı küçükse ilişki yönetimi, büyükse nakit koruma öncelik kazanabilir.",
      },
      {
        order: 3,
        question: "İlişkiyi korumak ne kadar önemli?",
        reason: "Stratejik müşteriyle tahsilat dili daha dikkatli tasarlanmalıdır.",
      },
      {
        order: 4,
        question: "Parçalı tahsilat mümkün mü?",
        reason: "Parçalı tahsilat ilişkiyi bozmadan nakit girişini hızlandırabilir.",
      },
      {
        order: 5,
        question: "Yeni iş teslimatı etkilenmeli mi?",
        reason: "Ödeme riski sürerken yeni teslimat yapmak riski büyütebilir.",
      },
    ],
  },
  {
    frameworkId: "team_decision_v1",
    category: "TEAM",
    title: "Ekip Kararı Çerçevesi",
    description:
      "Ekip sorunlarında kişi, sistem, performans ve yerine koyma maliyetini ayırmak için kullanılır.",
    steps: [
      {
        order: 1,
        question: "Sorun kişi mi sistem mi?",
        reason: "Kişi problemiyle sistem problemini karıştırmak yanlış müdahaleye yol açar.",
      },
      {
        order: 2,
        question: "Bu kişi kritik mi?",
        reason: "Kritik rol veya bilgi taşıyan kişiler için kararın operasyonel etkisi daha büyüktür.",
      },
      {
        order: 3,
        question: "Performans geçmişi nasıl?",
        reason: "Tek olay yerine performans geçmişi üzerinden karar almak daha sağlıklıdır.",
      },
      {
        order: 4,
        question: "Eğitimle çözülebilir mi?",
        reason: "Yetkinlik eksiği eğitimle kapanabilirken tutum problemi farklı yönetim gerektirir.",
      },
      {
        order: 5,
        question: "Yerine koyma maliyeti nedir?",
        reason: "Ayrılık veya değişim kararında işe alım, adaptasyon ve operasyon kaybı hesaba katılmalıdır.",
      },
    ],
  },
  {
    frameworkId: "customer_conflict_decision_v1",
    category: "CUSTOMER_CONFLICT",
    title: "Müşteri Çatışması Kararı Çerçevesi",
    description:
      "Müşteri çatışmalarında haklılık, beklenti, finansal etki ve referans riskini birlikte düşünmek için kullanılır.",
    steps: [
      {
        order: 1,
        question: "Müşteri haklı mı?",
        reason: "Gerçek hata işletmedeyse çözüm dili savunmacı değil telafi odaklı olmalıdır.",
      },
      {
        order: 2,
        question: "Beklenti mi yanlış yönetildi?",
        reason: "Yanlış beklenti yönetimi tekrar eden çatışmaların kök nedeni olabilir.",
      },
      {
        order: 3,
        question: "Finansal etkisi nedir?",
        reason: "Çözüm maliyeti ve kayıp riski kararın sınırlarını belirler.",
      },
      {
        order: 4,
        question: "Referans riski var mı?",
        reason: "Bazı müşterilerde itibar ve referans etkisi doğrudan finansal etkiden daha büyüktür.",
      },
      {
        order: 5,
        question: "Uzlaşma maliyeti nedir?",
        reason: "Uzlaşma maliyeti çatışmayı büyütmenin maliyetiyle karşılaştırılmalıdır.",
      },
    ],
  },
  {
    frameworkId: "cashflow_decision_v1",
    category: "CASHFLOW",
    title: "Nakit Akışı Kararı Çerçevesi",
    description:
      "Nakit akışı sorunlarında gelir, tahsilat, gider ve görünürlük alanlarını ayırmak için kullanılır.",
    steps: [
      {
        order: 1,
        question: "Sorun gelir mi tahsilat mı?",
        reason: "Gelir problemiyle tahsilat problemi farklı aksiyonlar gerektirir.",
      },
      {
        order: 2,
        question: "En büyük nakit çıkışı nerede?",
        reason: "Nakit çıkışının ana kaynağı bilinmeden doğru öncelik belirlenemez.",
      },
      {
        order: 3,
        question: "Hangi gider ertelenebilir?",
        reason: "Ertelenebilir giderler kısa vadeli nakit baskısını azaltabilir.",
      },
      {
        order: 4,
        question: "Hangi alacak hızlandırılabilir?",
        reason: "Hızlandırılabilir alacaklar dış finansmana ihtiyaç duymadan rahatlama sağlayabilir.",
      },
      {
        order: 5,
        question: "Kaç haftalık nakit görünürlüğü var?",
        reason: "Görünürlük süresi kararların aciliyetini ve risk seviyesini belirler.",
      },
    ],
  },
];

export function listManagerDecisionFrameworks(): ManagerDecisionFramework[] {
  return MANAGER_DECISION_FRAMEWORKS.map(cloneFramework);
}

export function getManagerDecisionFramework(
  category: ManagerAdviceCategory,
): ManagerDecisionFramework | null {
  const framework = MANAGER_DECISION_FRAMEWORKS.find(
    (item) => item.category === category,
  );

  return framework ? cloneFramework(framework) : null;
}

function cloneFramework(
  framework: ManagerDecisionFramework,
): ManagerDecisionFramework {
  return {
    ...framework,
    steps: framework.steps.map((step) => ({ ...step })),
  };
}
