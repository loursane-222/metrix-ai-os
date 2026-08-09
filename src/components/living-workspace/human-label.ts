// displayName/name gibi jenerik anahtarlar tek domain'e sabitlenmiş çeviri taşıyor — yeni bir domain aynı anahtarı farklı anlamda kullanırsa burada çakışma kontrolü gerekir.
export function humanLabel(key: string) { return ({
  count: "Toplam kayıt", displayName: "Müşteri", customerName: "Müşteri", balanceCents: "Toplam bakiye", dueDate: "Vade", createdAt: "Oluşturulma", updatedAt: "Güncelleme", status: "Durum", amount: "Toplam tutar", totalAmount: "Toplam tutar", title: "Başlık", description: "Açıklama", invoiceNumber: "Fatura numarası", invoiceTitle: "Fatura", paymentCount: "Tahsilat sayısı", paymentReferences: "Tahsilatlar", currency: "Para birimi", priority: "Öncelik", priorityLabel: "Öncelik", priorityExplanation: "Öncelik faktörleri", fulfillmentSummary: "Karşılama özeti", reservationStatus: "Rezervasyon durumu", deliveryProgressSummary: "Teslimat ilerlemesi", revisionHistorySummary: "Revizyon geçmişi", orderNumber: "Sipariş no", deliveryNumber: "İrsaliye no", integritySummary: "Sevkiyat bütünlüğü", onTimeDeliveryRate: "Zamanında teslim oranı", firstAttemptSuccessRate: "İlk seferde başarı", damageRate: "Hasar/eksik oranı", carrier: "Taşıyıcı", stock: "Stok", name: "Ürün",
  summary: "Özet", risks: "Riskler", opportunities: "Fırsatlar", dataQuality: "Veri kalitesi",
  legalName: "Yasal unvan",
  taxNumber: "Vergi numarası", phone: "Telefon", email: "E-posta", score: "Puan", avgLeadTimeDays: "Ortalama tedarik süresi (gün)", dependencyRiskFlag: "Bağımlılık riski",
  type: "Tür", category: "Kategori", priceCents: "Satış fiyatı", costCents: "Maliyet",
  body: "İçerik", severity: "Önem derecesi", isRead: "Okundu mu",
  deadlineAt: "Son teslim tarihi", commitmentAt: "Teslim taahhüdü",
  deliveryAddress: "Teslimat adresi", dispatchedAt: "Sevk tarihi", deliveredAt: "Teslim tarihi",
  cashPosition: "Nakit durumu", totalReceivable: "Toplam alacak", totalPayable: "Toplam borç", monthlyRevenue: "Aylık gelir", monthlyExpense: "Aylık gider", monthlyTaxLiability: "Aylık vergi yükümlülüğü",
  fullName: "Ad soyad", role: "Rol", joinedAt: "Katılma tarihi",
  period: "Dönem", targetRevenueCents: "Hedef gelir", targetCollectionCents: "Hedef tahsilat", actualValue: "Gerçekleşen", forecastValue: "Tahmini", startsAt: "Başlangıç", endsAt: "Bitiş",
  productServiceName: "Ürün/hizmet", warehouseName: "Depo", quantity: "Miktar", reservedQuantity: "Rezerve miktar", availableQuantity: "Kullanılabilir miktar", lot: "Lot", batch: "Parti", serialNumber: "Seri numarası", location: "Konum", healthSummary: "Sağlık özeti", openVarianceCount: "Açık sayım farkı", riskSignalCount: "Risk sinyali", opportunitySignalCount: "Fırsat sinyali",
  profileReadiness: "Profil hazırlığı", activeGoals: "Aktif hedefler", openManagementIssues: "Açık yönetim konuları", connectedDataSources: "Bağlı veri kaynakları", availableCount: "Kullanılabilir", unreadCount: "Okunmamış",
} as Record<string, string>)[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()); }
