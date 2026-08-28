# Görev Metni: METRIX'in Genel Müdür Karakteri, Bağlamda Kalma ve Canlı Sohbet Akışı

**Kime:** Claude Code (yeni oturum)
**Fazın türü:** DENETİM + İYİLEŞTİRME. Kapsam büyük ve baştan tam sınırlanamaz — önce keşif, sonra hedefli düzeltme.

---

## 0. Neden bu görev metni var

2026-08-20/21 oturumunda (Raporlama/Belge/KPI domain'lerinin canlıya alınması, birkaç gerçek hata düzeltmesi sırasında) Murat canlıda METRIX ile sohbet ederken şu gözlemleri yaptı ve bu görev metnini istedi:

1. METRIX bazen **uzun bir cevabı sesli olarak seslendiriyor**, sonra mesaj bittiğinde ekranda **daha kısa, farklı bir özet** kalıyor — söylenen ile yazılı kalan tutarsız.
2. METRIX **kendi adını bile tanımıyor** — "Metriks" (yazım hatası) dendiğinde bunu bir müşteri adı sanıp "öyle bir müşteri yok" diyor.
3. Kullanıcı METRIX'i düzelttiğinde ("METRIX senin adın, öyle bir müşteri yok demedim, teklifler sayfasını aç demek istedim") METRIX bunu bir insan gibi karşılamıyor — chatbot gibi, bağlamdan kopuk, ilgisiz bir cevap veriyor.
4. Genel izlenim: **METRIX gerçek, yaşayan bir genel müdür gibi konuşmuyor** — ezber cümleler, konuyla ilgisiz kalıp ifadeler ("tahsilat ve nakit riskleri netleşmeden yeni finansal risk almamış oluruz" gibi, tamamen alakasız bir bağlamda) "olur olmadık yerlerde" çıkıyor.

Murat'ın kendi sözü: *"metrixin iletişim becerisi, genel müdür karakteri, bağlamda kalma yeteneği, canlı sohbet akışı vs gibi konularda ciddi sorunlar var bunu kontrol etmeni istiyorum."*

## 1. Aynı oturumda zaten bulunan, doğrulanmış kök nedenler (buradan devam et, sıfırdan başlama)

Bu ikisi **gerçek kod okunarak bulundu ve kısmen düzeltildi** — ama kapsamı madde 0'daki gözlemlerin tamamını açıklamıyor, sadece bir dilimini:

### 1.1. `resolveNavigationAssistantContent` — gerçek cevabı atıp sabit cümleyle değiştiriyor
`src/lib/conversation-extensions/executive-navigation-command.ts:15`
```ts
export function resolveNavigationAssistantContent(content: string, completion: ExecutiveNavigationCompletion | null): string {
  if (!completion || completion.status === "COMPLETED") return content;
  return "İlgili çalışma alanını bu turda açamadım. Tekrar dener misiniz?";
}
```
Bir turda navigasyon komutu gönderildiyse ve `COMPLETED` durumuna ulaşmadıysa, METRIX'in **gerçekten ürettiği/sesli akıttığı** içerik tamamen atılıyor, yerine bu sabit cümle konuyor. Sesli modda TTS içeriği turun bitmesini beklemeden **anında** konuşmaya başladığı için (`orchestrator.onChunk(content)`, `src/components/metrix-tab/MetrixChatTab.tsx:626-627`), kullanıcı önce gerçek cevabı duyuyor, sonra ekranda kalan metin bambaşka/kısa oluyor. Madde 0.1'in en olası açıklaması budur.

Bu oturumda **bir tetikleyici** düzeltildi (commit `b8d5d34`): sohbet anlama katmanı, bir düzeltme/açıklama turunun önceki bir açma isteğini sadece tekrar ediyorsa (yeniden istemiyorsa) `businessNavigation`'ı tekrar doldurmuyor artık. Ama bu yalnızca **bir** tetikleyici — navigasyonun neden/ne sıklıkla `COMPLETED`'a ulaşamadığı (özellikle zaten açık olan bir yüzeye yeniden navigasyon senaryosunda) **derinlemesine incelenmedi**. `src/lib/conversation-extensions/conversation-navigation-runtime.ts`'deki durum makinesi (`CREATED → NAVIGATING → WAITING_FOR_SURFACE → CLAIMED → APPLYING → COMPLETED`) ve `LivingWorkspaceHost.tsx`'teki `completePresented`/`failPresentation` çağrı noktaları buradan incelenmeye başlanabilir.

### 1.2. İki ayrı, paralel mesaj yazma yolu (client-side)
`src/components/metrix-tab/MetrixChatTab.tsx` içinde:
- **Metin akışı yolu**: `activeTextGenerationRef` + `streamingContent` — sunucudan gelen her `chunk` olayında güncellenir (satır ~629-643).
- **Sesli okuma yolu**: `activeVoiceRevealGenerationRef` + `orchestrator.revealedText` — TTS konuşurken kelime kelime açığa çıkar (satır ~304-319).

Sesli modda İKİSİ DE aynı anda, birbirinden habersiz çalışıyor ve ikisi de `startNewAssistantMessage()`/`updateAssistantMessage()` çağırabiliyor. Bunun gerçekte kaç farklı görsel/işlevsel soruna yol açtığı (madde 0.1'in tamamını mı açıklıyor, yoksa 1.1 mi asıl sebep, yoksa ikisi birlikte mi) **tam netleştirilmedi**. Bu, "iki cevap motoru" hissinin muhtemel kaynağı.

## 2. Hiç dokunulmamış, kendi başına araştırılması gereken konular

### 2.1. Kendi adını tanımama (madde 0.2) — DÜZELTİLDİ, 2026-08-21, commit `4112c8d`

Bu belge yazıldıktan hemen sonra, aynı gün kapatılmış ama belge hiç güncellenmemişti (2026-08-26'da fark edildi). `src/lib/customers/customer-resolution.ts`'e `isMetrixSelfReference()` eklendi — "metrix"/"metriks" varyantlarını normalize edip hem sınıflandırıcı prompt seviyesinde hem de `resolveBusinessNavigation`'da kod-seviyesinde (defense-in-depth) filtreliyor. Commit mesajı: *"METRIX/Metrix/Metriks now never becomes an entityReference in any context."*

### 2.2. Düzeltmeye insan gibi karşılık verememe (madde 0.3) — DÜZELTİLDİ, 2026-08-21, commit `4112c8d`

Aynı commit'in ikinci parçası: `executive-identity-prompt.ts`'e kullanıcı METRIX'i düzelttiğinde ("hayır öyle demedim, X demek istedim") bunu doğal, insan gibi bir anlaşma anı olarak kabul etme talimatı eklendi (bkz. `EXECUTIVE_PRESENCE_POLICY`'nin "Kullanıcı seni... düzeltiyorsa..." satırı). Ayrı bir `conversationKind`/`userMotivation` boyutu eklenmedi — bunun yerine doğrudan kimlik prompt'una davranışsal talimat olarak işlendi.

### 2.3. Ezber cümleler, kalıp ifadeler (madde 0.4)
Bu oturumda bulunan somut örnek (`src/lib/executive-brain/ai-general-manager-brief.service.ts` — `translateDecisionTitle`/`buildOpeningMessage` fonksiyonları, `category`'ye göre sabit cümle döndürüyor) yalnızca **bir kaynak**. Progressive enrichment mekanizması (`buildProgressiveEnrichmentEvidence`, `route.ts:1860`) bu sabit cümleleri "yeni içgörü" diye modele veriyor ve model bunları alakasız yerlerde araya sıkıştırabiliyor — madde 1.1'deki kapatma turunda gördüğümüz "tahsilat ve nakit riski..." cümlesi tam olarak buradan geldi (bu spesifik tetikleyici artık kapalı, ama mekanizmanın kendisi hâlâ var ve başka turlarda aynı şekilde alakasız içerik ekleyebilir). Bu genel deseni (gerçek ama o ana özgü olmayan "şirketin en önemli kararı" bilgisinin, konuyla hiç ilgisi olmayan turlara sızması) sistematik olarak taraman gerekiyor — sadece bu bir örneği değil.

Diğer olası kaynaklar: `src/lib/manager-advice/manager-advice-guidance.service.ts`, `src/lib/executive-performance-signal/`, ve genel olarak "executive brain" ailesindeki tüm sabit/şablon cümle üreten fonksiyonlar — bunların ne zaman/hangi koşulda gerçekten kullanıcı mesajıyla ilgili olduğu, ne zaman zorla eklendiği ayrı ayrı denetlenmeli.

## 3. Önerilen yaklaşım (bağlayıcı değil, başlangıç noktası)

1. **Keşif önce**: Yukarıdaki 5 alt-konunun (1.1 derinleştirme, 1.2, 2.1, 2.2, 2.3) her biri için kod okuyarak gerçek mekanizmayı bul — varsaymadan. Mümkünse gerçek bir oturumla (Murat'ın kendi hesabı) canlıda birkaç senaryo tekrar deneyip loglardan (`emitBusinessNavigationTelemetry`, `logChatLatency` çıktıları) doğrula.
2. **Bulguları rapor et, sonra düzelt** — bu görev metni MADDE 5'teki "Kabul Kriterleri"ne ulaşmadan "tamamlandı" denemez, ama kapsam büyük olduğu için Murat ile ara kontrol noktaları (her alt-konu bulgusundan sonra kısa bir durum raporu) faydalı olur.
3. **Kapsamı büyütme riski yüksek** — özellikle 2.3 (ezber cümleler) sistemik bir tarama gerektiriyor, "her şeyi bugün bitir" beklentisiyle başlama; Murat ile hangi alt-konunun öncelikli olduğunu netleştir.

## 4. Ortak Kurallar (bu oturumdan taşınan, geçerliliğini koruyan)

- METRIX'in ürünü: Sohbet + tek Living Workspace. Modüller/sayfalar değil.
- Sesli ve yazılı aynı Conversation Understanding, planner, Action Runtime, Living Workspace, canonical yanıt zincirini kullanır — ikinci bir beyin, ikinci bir planlayıcı yok.
- METRIX gerçek, kanıtlanmış bir yetki reddi olmadan asla "yapamam"/"erişimim yok" demez — ve simetrik olarak, gerçekleşmemiş bir işlemi asla "yaptım" demez.
- Yeni yetenekler her zaman tek Executive akışının parçası olarak inşa edilir, ayrı modül olarak değil.
- Sahte/simüle sinyal üretme yasağı: bir sinyal/veri yoksa, o özellik o durumda sessizce devre dışı kalır — asla uydurulmaz.
- Sadece açıkça istendiğinde commit/push yap.

## 5. Kabul Kriterleri

- Madde 0'daki 4 gözlemin her biri için: gerçek kök neden bulundu mu, kanıtla (dosya:satır) gösterildi mi.
- Yapılan her düzeltme için: typecheck + tam test paketi + (varsa) tarayıcı doğrulaması.
- Hangi alt-konuların bu turda çözüldüğü, hangilerinin hâlâ açık/takip gerektirdiği raporda net ayrılmalı — hepsini bitirmiş gibi göstermek yasak.

## 6. Kapsam dışı (bu görev metninde)

- Domain tamamlama (Üretim, Entegrasyon vb.) — ayrı, bitmiş bir çalışma hattı.
- Yeni özellik eklemek — bu görev metni yalnızca mevcut karakter/iletişim kalitesini düzeltmekle ilgili, yeni yetenek inşa etmek değil.
