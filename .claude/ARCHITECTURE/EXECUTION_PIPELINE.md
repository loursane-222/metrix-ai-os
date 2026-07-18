# Execution Pipeline

## Normatif sıra

```text
User Request
    ↓
Conversation Understanding
    ↓
Capability Resolution
    ↓
Entity Resolution
    ↓
Context Resolution
    ↓
Execution Strategy
    ↓
Executive Operating Context
    ↓
Executive Operating System
    ↓
Execution Runtime
    ↓
Prompt Bridge
    ↓
Language Model
    ↓
Response
```

Bu, Executive Runtime için değiştirilemez mantıksal karar sırasıdır. Her request bütün aşamalarda ağır işlem yapmak zorunda değildir. Bir aşama gerekmiyorsa sonucu açıkça `skipped/not applicable` olur; sıra tersine çevrilmez ve sorumluluk sonraki aşamaya devredilmez.

## Aşama sözleşmeleri

| Aşama | Girdi | Çıktı | Durma koşulu |
|---|---|---|---|
| User Request | Transport, authenticated actor ve ham kullanıcı girdisi | Normalize edilmeye hazır request envelope | Kimlik, scope veya temel input geçersiz |
| Conversation Understanding | Mesaj ve izinli conversation sinyalleri | Typed understanding, confidence, clarification/reasoning sinyali | Mesaj güvenle anlaşılamıyor ve clarification gerekli |
| Capability Resolution | Typed understanding | Registered capability veya no-match/ambiguous sonucu | Capability yok veya belirsiz |
| Entity Resolution | Capability entity gereksinimleri ve izinli referanslar | Organization-scoped typed entity refs | Gerekli entity eksik, ambiguous veya geçersiz |
| Context Resolution | Capability, entity refs ve request scope | Minimum, versioned context seti | Zorunlu context çözülemiyor |
| Execution Strategy | Capability ve çözümleme sonuçları | Answer/reasoning/draft/approval/execution planı | Güvenli bir plan üretilemiyor |
| Executive Operating Context | Planın ihtiyaç duyduğu organization/context kaynakları | Typed intelligence composition ve diagnostics | Strategy'nin zorunlu gördüğü context yok |
| Executive Operating System | Executive context, company model ve tanımlı modeller | Typed executive reasoning/next move | Reasoning gerekli fakat üretilemiyor |
| Execution Runtime | Typed, doğrulanmış execution candidate | Execution result, approval-required veya typed failure | Policy deny, approval eksik, validation ya da execution hatası |
| Prompt Bridge | Seçilmiş context ve reasoning çıktıları | Sınırlı model context'i | Gerekli prompt context'i üretilemiyor |
| Language Model | Prompt contract ve bridge çıktısı | Doğal dil/şemalı aday çıktı | Provider veya output validation hatası |
| Response | Strategy, execution ve model sonuçları | Kullanıcıya güvenli transport cevabı | Son aşamadır |

## Sıra neden değiştirilemez

- **Understanding → Capability:** Ne istendiği anlaşılmadan hangi iş yeteneğinin gerektiği seçilemez.
- **Capability → Entity:** Hangi entity türünün gerekli olduğunu capability contract belirler.
- **Entity → Context:** Context ancak hedef ve organization scope bilindiğinde doğru çözülebilir.
- **Context → Strategy:** Eksiklik, freshness ve confidence hangi güvenli yolun seçilebileceğini etkiler.
- **Strategy → Intelligence:** Yalnızca planın gerektirdiği executive intelligence üretilir; context üretimi routing yapmaz.
- **Intelligence → Execution:** Muhakeme, icraya otorite vermez; execution hâlâ typed request ve policy kontrolü ister.
- **Execution → Prompt/Response:** Gerçek execution sonucu bilinmeden başarı, approval veya failure mesajı yazılamaz.
- **Prompt Bridge → Model:** Model yalnızca seçilmiş ve sınırlandırılmış context'i görür; ham runtime iç durumuna sahip olmaz.

## Branch ve skip kuralları

- General chat veya answer-only strategy; entity, executive reasoning ve execution aşamalarını açıkça atlayabilir.
- Clarification strategy pipeline'ı güvenli bir clarification response ile durdurabilir.
- Read-only executive advice, Execution Runtime'ı atlayabilir; Executive Operating Context ve Executive Operating System'i kullanabilir.
- Surface düzenleme, Draft Runtime yolunu kullanabilir ve kalıcı mutation öncesinde durabilir.
- Approval gerektiren Domain Action, approval sonucu dönerek durur; aynı action bilgileriyle bağlı geçerli grant olmadan devam etmez.
- Bir stage'in fast-path uygulaması olabilir. Fast-path aynı typed çıktıyı ve aynı sorumluluk sınırını korumalıdır.

## Paralellik ve optimizasyon

Bağımsız I/O operasyonları paralel çalışabilir. Örneğin aynı aşamanın bağımsız context kaynakları eşzamanlı okunabilir. Ancak paralellik şu kuralları bozamaz:

- Sonraki aşama önceki aşamanın henüz oluşmamış kararını tahmin edemez.
- Spekülatif çalışma kalıcı write veya external side effect üretemez.
- Paralel sonuçlar ait oldukları aşamada birleştirilir ve diagnostics/confidence kaybolmaz.
- Performans optimizasyonu capability, strategy, policy veya approval otoritesini başka katmana taşıyamaz.

## Execution Runtime iç sırası

Domain Action Execution Runtime'ın mevcut sabit alt pipeline'ı korunur:

```text
Registry lookup
→ Input validation
→ Policy evaluation and audit
→ Approval verification and audit
→ Idempotency check
→ Operation creation
→ Execution envelope
→ Handler execution and audit
→ Outbox enqueue
→ Result and audit
→ Operation completion
→ Idempotency completion
```

Bu alt sıra üst pipeline'ın yerine geçmez. Üst pipeline “hangi capability ve strategy” sorusunu; Execution Runtime alt pipeline'ı “verilmiş Domain Action güvenli ve deterministik biçimde nasıl yürütülür” sorusunu cevaplar.

## Sonuç bütünlüğü

Response yalnızca doğrulanmış upstream durumunu ifade eder. Model metni:

- başarısız işi başarılı gösteremez,
- pending approval'ı tamamlanmış mutation gibi sunamaz,
- draft'ı persisted state gibi sunamaz,
- unresolved entity'yi doğrulanmış hedef gibi sunamaz,
- düşük confidence bilgisini gizleyemez.
