# Executive Cognitive Stack v1

**Durum:** Mimari doküman — implementasyon Faz 1 öncesi kilitlenmiş kaynak
**Kapsam:** Executive Mind Runtime → Executive Conversation Orchestrator → Speech Runtime
**Constitution referansı:** metrix-proje-anayasasi.md, metrix-sohbet-anayasasi.md, metrix-liderlik-dnasi.md, executive-team-constitution-v1.md, executive-knowledge-constitution-v1.md, strategic-constitution-v1.md, executive-conversation-architecture-v1.md, executive-conversation-benchmark-v1.md

---

## Amaç

Bu doküman, METRIX'in konuşmadan bağımsız yaşayan zihin katmanından (Mind Runtime) gerçek konuşma davranışına (Speech Runtime) kadar uzanan mimariyi tek kaynakta kilitler. İmplementasyon bu belgeye göre faz faz yürütülür. Kod, prompt veya API tasarımı içermez.

---

## 1. Nihai Katman Şeması

```
[ Zihin Kümesi — sürekli, eşzamanlı ]
  Executive Mind Runtime
    └─ Executive Mind State
    └─ Executive Attention
    └─ Executive Momentum
    └─ Executive Cognitive Lifecycle
            │
            │  (olgun Belief + Momentum — tek çıkış noktası)
            ▼
[ Eylem Zinciri — doğrusal, kapılı ]
  Executive Intent System
            ▼
  Executive Decision Runtime
            ▼
  Executive Conversation Orchestrator (ECO)
            ▼
  Speech Runtime
            ▼
      Kullanıcıya ulaşan konuşma
```

Stack iki farklı rejimden oluşur:

- **Zihin Kümesi** — Mind State, Attention, Momentum ve Cognitive Lifecycle birbirini sürekli besleyen, eşzamanlı çalışan bir kümedir. Katı bir sıra değildir; Attention'ın seçtiği odak Lifecycle'ı besler, Lifecycle'ın ürettiği muhakeme Attention'ın bir sonraki seçimini etkiler.
- **Eylem Zinciri** — Intent System'den Speech Runtime'a kadar kesinlikle doğrusaldır. Her katman bir sonrakini kapılar; yetki yalnızca yukarıdan aşağıya akar.

**Sinyal çift yönlü akabilir** (ham telemetri yukarı — kullanıcı sesi, barge-in, uygulama sonucu — Attention'a veya Decision Runtime'a girebilir), **yetki/yargı tek yönlüdür** (yalnızca yukarıdan aşağıya). ECO'nun veya Speech Runtime'ın gönderdiği hiçbir sinyal bir yargı değil, ham durum bilgisidir.

---

## 2. Zihin Kümesi

### 2.1 Executive Mind Runtime

Konuşmadan bağımsız, sürekli var olan taşıyıcı süreç. Bir konuşma başladığında doğmaz, bittiğinde ölmez. Executive Brain'den farkı: Executive Brain şirket hakkında doğru olanı üretir (dış gerçeklik); Mind Runtime METRIX'in o an neye odaklandığını, neye kanaat getirdiğini taşır (iç zihin durumu).

### 2.2 Executive Mind State

Runtime'ın herhangi bir andaki taşınabilir görüntüsü. Alanları: Attention Focus, Working Memory, Hypothesis Set, Belief, Evidence Ledger (geçici), Pending Intent Queue, Momentum Descriptor, Presence Descriptor, Cognitive Energy Allocation.

Working Memory yalnızca "şu an yüklü" içeriği tutar; kalıcılık mekanizması değildir. Kalıcı gerçeğin tek kaynağı Memory Foundation'dır.

### 2.3 Executive Attention

Mind State'in hangi bölümünün ön planda olduğunu seçen mekanizma. Sinyaller: ilgi, aciliyet, çözümsüzlük, süreklilik/atalet. Özellikler: kıtlık, atalet, kesilebilirlik.

### 2.4 Executive Momentum

Her aktif düşünceye ait gelişim göstergesi. Bileşenleri: Hız (Velocity), Olgunluk (Maturity), Hazırlık Eşiği (Readiness Gate), Sönme (Decay). Attention'ın ışığı altında olmayan düşünceler de arka planda momentum biriktirebilir.

### 2.5 Executive Cognitive Lifecycle

Bir düşüncenin yaşam evreleri: Doğuş → Olgunlaşma → Konuşmaya Dönüşüm (Intent System'e teslim) → Revizyon → Terk. Belief'in Memory Foundation'a terfisi bu katmandan, ayrı ve kapılı bir yolla gerçekleşir — konuşma zincirinin parçası değildir.

---

## 3. Eylem Zinciri

### 3.1 Executive Intent System

Bir söz adayının **neden** söyleneceğini (yönetim amacını) çözer. Türler: Bilgi Toplama, Kanaat Bildirme, Risk Azaltma, Yön Verme, İkna Etme, Durdurma, Netleştirme, Güven Verme, Zor Soru Sorma, Geri Çekilme. Lifecycle: Doğuş, Güçlenme, Erteleme, Bastırma, Çatışma, Birleşme, Terk. Öncelik sırası: Executive DNA → risk büyüklüğü → hazırlık (Momentum) → ilişki/zamanlama uygunluğu (Strategic Identity) → tekil ifade ilkesi.

### 3.2 Executive Decision Runtime

Çözülmüş Intent'i **somut bir eylem fiiline** indirger: Söyle, Bekle, Sor, İtiraz Et, Sakinleştir, Yön Değiştir, Sus, Geri Dön, Derinleştir, Kapat. Lifecycle: Tetiklenme, Değerlendirme, Commit, Gözlem, Revizyon/İptal. Her decision bir Confidence (bu anın doğruluğuna dair kesinlik), bir Latency penceresi (geçerlilik süresi) ve bir Reversal imkânı taşır.

### 3.3 Executive Conversation Orchestrator (ECO)

Karar vermez. Zaten verilmiş kararları **zamanda** yaşatır: Turn Lifecycle (açılış, gelişim, yön değişimi, bekleme, devam, kapanış), Conversation Flow (iplik kimliğiyle çoklu turn'e yayılma), Executive Rhythm (Cognitive Energy'den türeyen tempo), Natural Pause (işlem/düşünme/anlamlı sessizlik ayrımı), Thinking While Speaking (turn açıkken gelen revize kararları özümseme), Barge-in Recovery (iplik/momentumu koruyarak duraklatma), Director/Async Enrichment içeriğinin fark ettirilmeden akışa katılması.

### 3.4 Speech Runtime

ECO'nun turn talimatını (aç/devam/duraklat/kapat + tempo niyeti) kelime/ses düzeyinde üretime çevirir: prozodi, ses/metin senkronu, zamanlama. Turn yapısına veya tempo niyetine karar vermez, yalnızca uygular.

---

## 4. Katman Sorumluluk ve Sınır Tablosu

| Katman | Sahiplendiği (tek sorumluluk) | Yapamayacağı |
|---|---|---|
| Mind Runtime | Sürekli sürecin taşıyıcısı olmak | Kendi başına yargı üretmek |
| Mind State | O anki içeriğin görüntüsü | İçerik hakkında ne yapılacağına karar vermek |
| Attention | Ön plandaki odağı seçmek | Neden önemli olduğuna veya ne yapılacağına karar vermek |
| Momentum | Düşüncenin gelişim yörüngesi | Düşüncenin içeriği veya söylenme amacı |
| Cognitive Lifecycle | Hipotez/Belief doğuşu, olgunlaşması, revizyonu, terki | Amaç (intent) veya eylem (decision) |
| Intent System | Amaç sınıflandırması, gücü, çatışma çözümü | İçerik doğruluğu, somut eylem/zamanlama |
| Decision Runtime | Eylem fiili + zamanlama/güven/geri alma | İçerik, amaç, nasıl söyleneceği |
| ECO | Zaten karara bağlanmış eylemin zamansal/ritmik şekli | İçerik/amaç/eylem türü hakkında yargı |
| Speech Runtime | Kelime/ses üretimi, prozodi, senkron | Turn yapısı veya tempo kararı (yalnızca uygular) |

---

## 5. Input/Output Sözleşmeleri

| Katman | Girdi | Çıktı |
|---|---|---|
| Attention | Mind State'in hipotez/kanıt/aciliyet sinyalleri + dış uyaran | O anki odak ataması |
| Cognitive Lifecycle | Attention'ın odağı + gelen kanıt (kullanıcı, Director, Executive Brain, Async Enrichment) | Güncellenmiş Hypothesis/Belief + Confidence |
| Momentum | İlgili düşüncenin kanıt geçmişi ve güncelleme sıklığı | Hız/olgunluk/hazırlık/sönme göstergesi |
| Intent System | Olgun Belief + Momentum + Director eskalasyonu + Strategic Identity kalibrasyonu + Executive DNA kısıtı | Çözülmüş Intent (tür + güç) |
| Decision Runtime | Çözülmüş Intent + ECO'dan ham konuşma-anı telemetrisi + DNA/Memory/Strategic kısıtları | Tek Decision (fiil + içerik referansı + güven + gecikme penceresi) |
| ECO | Decision akışı (iplik kimlikli) + Speech Runtime uygulama telemetrisi | Speech Runtime'a turn-şekillendirme talimatı |
| Speech Runtime | ECO'nun turn talimatı + içerik payload'ı | Kullanıcıya ulaşan söz + uygulama telemetrisi (ECO'ya geri) |

---

## 6. Mevcut Anayasa Sistemleriyle Sınırlar

| Sistem | İlişki | Dokunulmazlık |
|---|---|---|
| Executive Brain | Cognitive Lifecycle'a bir kanıt kaynağı olarak beslenir | Şirket-gerçekliğinin tek sahibi kalır |
| Director sistemi | Rolleri/eskalasyon kuralları değişmez; Stack'e ikinci, sürekli bir tüketim kanalı eklenir | Kullanıcıyla hiçbir zaman doğrudan konuşmaz; yalnızca AI Genel Müdür'ün sesiyle çıkar |
| Memory Foundation | Yalnızca tek yönlü, nadir, kapılı Terfi mekanizmasıyla bağlanır | Kalıcı gerçeğin tek sahibi kalır; Stack'in geçici içeriği otomatik yazılmaz |
| Strategic Identity | İki kalibrasyon noktasında (Intent, Decision) salt-okunur tüketilir | Yavaş/stratejik rejim ile hızlı/konuşmasal rejim aynı depoyu paylaşmaz |
| Executive DNA | Intent ve Decision katmanlarında mutlak filtre | Hiçbir katman DNA'yı bir öncelik faktörü gibi tartamaz |
| Executive Social Intelligence | "Runtime'da yeniden hesaplanmaz" ilkesi (Katman 7.10) tam korunur | Stack'in sürekli muhakemesi farklı eksende çalışır (durum/içerik, kimlik/kültür değil) |
| Constitution (Kurucu Mimari Uygunluk İlkesi) | Her faz sonunda üç soru yeniden sorulur | Üç sorudan biri "hayır" ise faz tamamlanmış sayılmaz |

---

## 7. Request-Response Kırılım Noktaları

| Request-response varsayımı | Stack'te kırıldığı yer |
|---|---|
| Turn'ler arası durum yok | Mind Runtime/Mind State'in sürekli varlığı |
| Muhakeme tek bir çıktıya bağlı | Cognitive Lifecycle'ın muhakemeyi çıktıdan ayırması |
| Her turn'de zorunlu kapanış | Decision Runtime'ın Bekle/Sus fiilleri + Intent Maturation |
| Tek çökmüş cevap, alternatif izi yok | Hypothesis Management'ın eşzamanlı çoklu aday tutması |
| Sözün arkasında bağımsız "neden" yok | Intent System'in her sözü bir amaca bağlaması |
| Tek doğrusal akış | Attention/Momentum'un arka planda farklı hızda ilerleyen iplikleri |
| Süslenmiş ama sahte prezans | Presence Descriptor'ın gerçek Attention/Momentum/ECO durumundan türemesi |
| İçerikten bağımsız tekdüze tempo | Cognitive Energy'den türeyen Executive Rhythm |
| Kesinti = sıfırlama | Barge-in Recovery'nin iplik/momentumu koruması |

---

## 8. Gemini Live Doğallık Karşılıkları

| Gözlem | Stack'teki karşılığı |
|---|---|
| Sürekli bağlantı hissi | Turn Lifecycle'ın turn'ler arası sıfırlanmaması + Mind State sürekliliği |
| Hızlı geçiş | Decision Latency + ECO Rhythm |
| Kesilebilirlik | Attention'ın kesilebilirliği + Barge-in Recovery + Decision Reversal |
| Cevaptan önce onay | Natural Pause Model + Presence Descriptor |
| Uzunluk kalibrasyonu | Cognitive Energy'den türeyen Executive Rhythm |
| Açık sonlandırma | Kullanıcı güdümlü — "Kapat" fiili bir düşünce ipliğini kapatır, oturumu değil |

---

## 9. Production İmplementasyon Fazları

| Faz | Kapsam | Doğrulanan şey | Geri alınabilirlik |
|---|---|---|---|
| **Faz 1** — Mind State taşıyıcı katmanı | Attention Focus, Working Memory, temel Hypothesis/Belief alanlarının kalıcı görüntüsü; davranış üretmez | Konuşmadan bağımsız durum gerçekten tutulabiliyor mu? | Kapatılırsa sistem bugünkü hale döner |
| **Faz 2** — Attention + Momentum gözlemci modu | Yalnızca gözlemci (davranışı etkilemeyen) çalıştırma | Sinyaller doğru okunuyor mu? | Etkisiz olduğu için risksiz kaldırılır |
| **Faz 3** — Cognitive Lifecycle görünmez mod | Tek bir kanıt kaynağıyla sınırlı, kullanıcıya yansımadan aktifleştirme | Evidence→Hypothesis→Belief zinciri doğru çalışıyor mu? | Görünmez olduğu için düşük risk |
| **Faz 4** — Intent System dar alt küme | Yalnızca Netleştirme ve Bilgi Toplama türleri | En düşük riskli intent türleri doğru doğuyor mu? | Sınırlı blast radius |
| **Faz 5** — Decision Runtime: Söyle / Bekle | Yalnızca bu ikili kararla sınırlı aktifleştirme | İlk gözle görülür davranış değişikliği doğru mu? | Tek anahtar geri alma noktası |
| **Faz 6** — ECO: Turn Lifecycle + Natural Pause | Mevcut Fast Presence/Conversation Continuity üzerine katmanlı ekleme | Mevcut V4 mekanizmaları bozulmadan üstüne biniyor mu? | Kaldırılırsa V4 davranışı aynen kalır |
| **Faz 7** — Barge-in Recovery + Executive Rhythm | Kesinti ve tempo mekanizmalarının tam devreye alınması | Kesinti gerçekten "duraklatma" gibi hissettiriyor mu? | İzole, geri alınabilir özellik seti |
| **Faz 8** — Director Contribution + Async Enrichment | Arka plan katkısının tam entegrasyonu | Katkı görünmeden akışa karışıyor mu? | Kaynak bazında ayrı ayrı devre dışı bırakılabilir |
| **Faz 9** — Memory Foundation terfi kapısı | Mind State → Memory Foundation terfi mekanizması | Kalıcı veri bütünlüğü korunuyor mu? | En son ve en riskli adım |

Her fazın sonunda Kurucu Mimari Kontrolü (anayasaya uygun mu / yayılabilir mi / kalıcı mı) yeniden uygulanır; üç sorudan biri "hayır" ise bir sonraki faza geçilmez.

---

## Kurucu Mimari Kontrolü

1. METRIX Anayasalarına uygun mu? **Evet** — Executive Brain, Director sistemi, Memory Foundation, Strategic Identity ve Executive DNA'nın mevcut yetkileri korunmuştur; Stack bunların yerine geçmez.
2. Gelecekte tüm sisteme yayılabilir mi? **Evet** — katmanlar bağımsız ve sıralıdır; her biri ayrı fazla devreye alınabilir.
3. Kurucu mimarinin kalıcı parçası mı? **Evet** — geçici bir yama değil, Conversation Engine'in ön koşulu olarak tasarlanmış kalıcı bir katmandır.
