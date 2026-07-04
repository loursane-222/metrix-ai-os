// Genel işletme / finans / organizasyon bilgisi taşıyıcı yapı.
// Şirkete özgü değil; evrensel yönetim bilgisi. Şimdilik tipler; runtime doldurma sonraki fazda.

export type BusinessCyclePrinciple =
  | "cashflow_precedes_profit"
  | "capacity_precedes_growth"
  | "retention_precedes_acquisition"
  | "process_precedes_speed"
  | "people_precede_systems";

export type FinancialHealthPrinciple = {
  id: string;
  principle: string;
  warningSign: string;
  recoveryLevers: string[];
};

export type SalesCyclePrinciple = {
  id: string;
  principle: string;
  commonPitfall: string;
};

export type PeoplePrinciple = {
  id: string;
  principle: string;
  organizationalImpact: string;
};

export type OperationalPrinciple = {
  id: string;
  principle: string;
  bottleneckIndicator: string;
};

export type ExecutiveWorldModel = {
  cashflowPrinciples: FinancialHealthPrinciple[];
  salesCyclePrinciples: SalesCyclePrinciple[];
  peoplePrinciples: PeoplePrinciple[];
  operationalPrinciples: OperationalPrinciple[];
  keyBusinessCyclePrinciples: BusinessCyclePrinciple[];
};

export const EMPTY_EXECUTIVE_WORLD_MODEL: ExecutiveWorldModel = {
  cashflowPrinciples: [],
  salesCyclePrinciples: [],
  peoplePrinciples: [],
  operationalPrinciples: [],
  keyBusinessCyclePrinciples: [],
};

export const EXECUTIVE_WORLD_MODEL: ExecutiveWorldModel = {
  cashflowPrinciples: [
    {
      id: "cf-1",
      principle: "Tahsilat gerçekleşmeden gelir yoktur. Fatura kesilmesi veya sözleşme imzalanması kasa değildir.",
      warningSign: "Alacak yaşı uzuyor; tahsilat oranı düşüyor.",
      recoveryLevers: ["Tahsilat öncelik listesi oluştur", "Müşteri bazlı vade analizi yap", "Ödeme planı teklif et"],
    },
    {
      id: "cf-2",
      principle: "Kısa vadeli borç uzun vadeli varlıkla finanse edilmez. Vade uyumsuzluğu likidite krizi yaratır.",
      warningSign: "Dönen varlık / kısa vadeli borç oranı 1'in altına düşüyor.",
      recoveryLevers: ["Kısa vadeli borcu yapılandır", "Uzun vadeli finansman alternatifi ara", "Harcama önceliklerini yeniden sırala"],
    },
    {
      id: "cf-3",
      principle: "Nakit açığı büyümeden önce görülür. Erken sinyal yakalanmazsa müdahale geç kalır.",
      warningSign: "Aylık nakit tüketim hızı gelir büyümesini geçiyor.",
      recoveryLevers: ["13 haftalık nakit projeksiyon yap", "Değişken giderleri hemen kıs", "Kritik olmayan ödemeleri ertele"],
    },
  ],

  salesCyclePrinciples: [
    {
      id: "sc-1",
      principle: "Pipeline'daki fırsat sayısı değil, nitelikli fırsat sayısı önemlidir. Doluluk hissi karar yanılgısı yaratır.",
      commonPitfall: "Her görüşmeyi fırsat saymak; gerçek kapanma olasılığını abartmak.",
    },
    {
      id: "sc-2",
      principle: "Teklif vermek satış değildir. Takip olmadan teklif ölür; takip sürecinin sahibi belirlenmelidir.",
      commonPitfall: "Teklif gönderildi diye sürecin ilerleyeceğini varsaymak.",
    },
    {
      id: "sc-3",
      principle: "Müşteri 'hayır' demeden önce sinyal verir. Bu sinyaller yakalanamıyorsa süreç kör yürüyor.",
      commonPitfall: "Müşteri sessizliğini olumlu işaret olarak yorumlamak.",
    },
    {
      id: "sc-4",
      principle: "Satış döngüsü uzadıkça karar alıcı değişir. Uzun döngülerde ilişki sürekli canlı tutulmalıdır.",
      commonPitfall: "İlk görüşmedeki karar alıcının hâlâ yetkili olduğunu varsaymak.",
    },
  ],

  peoplePrinciples: [
    {
      id: "pp-1",
      principle: "Yanlış kişiyi elde tutmak doğru kişiyi uzaklaştırır. Düşük performans tolere edildiğinde ekip standardı ona göre ayarlanır.",
      organizationalImpact: "Ekip motivasyonu ve kalite standardı düşer; en iyi performans gösterenler ayrılır.",
    },
    {
      id: "pp-2",
      principle: "Performans düşüklüğü önce netlik eksikliğidir. Beklenti açık değilse yetenek meselesi olduğu varsayılamaz.",
      organizationalImpact: "Beklenti netleştirilmeden yapılan performans görüşmeleri güveni zedeler.",
    },
    {
      id: "pp-3",
      principle: "Delegasyon yetki vermek değil, sorumluluk transferidir. Sonucu takip etmeden devretmek kontrolü kaybetmektir.",
      organizationalImpact: "Takipsiz delegasyon kritik görevlerde gecikme ve kalite kaybı yaratır.",
    },
  ],

  operationalPrinciples: [
    {
      id: "op-1",
      principle: "Darboğaz tespit edilmeden hız artırılamaz. Kısıt bilinmeden yapılan hız artışı kaosu büyütür.",
      bottleneckIndicator: "Bir adımda birikim artıyor; çıktı hızı girdi hızının altında kalıyor.",
    },
    {
      id: "op-2",
      principle: "Tanımlanmamış iş tekrarlanır; tanımlanmış iş iyileştirilebilir. Süreç yazılmadan ölçek çalışmaz.",
      bottleneckIndicator: "Aynı hatalar farklı kişilerce tekrarlanıyor; onboarding uzuyor.",
    },
    {
      id: "op-3",
      principle: "Kapasite dolmadan ölçekleme planlanmalıdır. Kapasite tükendikten sonra planlama reaktif kalır.",
      bottleneckIndicator: "Ekip üyeleri sürekli aşırı yüklü; yeni iş alınması mevcut işi erteliyor.",
    },
  ],

  keyBusinessCyclePrinciples: [
    "cashflow_precedes_profit",
    "capacity_precedes_growth",
    "retention_precedes_acquisition",
    "process_precedes_speed",
    "people_precede_systems",
  ],
};
