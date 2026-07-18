# Executive Capability Registry

## Capability tanımı

**Capability, METRIX'in çözebildiği tanımlı bir iş yeteneğidir.** Kullanıcının ulaşmak istediği iş sonucunu ifade eder; bu sonucun hangi sınıf, servis, model veya tool ile gerçekleştirildiğini ifade etmez.

```text
Capability ≠ Runtime
Capability ≠ Tool
Capability ≠ Action
Capability = Çözülebilecek iş yeteneği
```

Örneğin “müşteri bilgisini güncelleyebilme” bir capability olabilir. Draft Runtime, Approval Service, Execution Runtime ve customer handler bu capability'nin farklı execution aşamalarına katılabilir; hiçbiri tek başına capability değildir. Aynı şekilde `customers.update` benzeri bir action, capability'nin icra primitive'idir ve kullanıcıya sunulan iş yeteneğinin tamamı değildir.

## Registry'nin rolü

Executive Capability Registry, capability adları ile onları gerçekleştirebilen mevcut runtime contract'ları arasındaki deklaratif eşlemenin mimari kaynağıdır. Bu belge registry'nin kontratını tanımlar; implementation, storage veya routing kodu eklemez.

Registry şu sorulara cevap vermelidir:

- Bu capability'nin kararlı kimliği ve iş sonucu nedir?
- Hangi kullanıcı niyeti ve Conversation Understanding sinyalleri aday eşleşme oluşturur?
- Hangi entity türleri ve context gereksinimleri vardır?
- Hangi execution mode'ları desteklenir: answer, reasoning, draft, approval, domain action?
- Capability'nin sahibi olan mevcut domain/runtime sınırı hangisidir?
- Hangi registered action'lar capability'nin olası icra primitive'leridir?
- Hangi permission/risk metadata'sı execution aşamasında ayrıca değerlendirilmelidir?

## Normatif capability kaydı

Gelecekteki her capability kaydı kavramsal olarak aşağıdaki alanlara sahip olmalıdır:

| Alan | Sözleşme |
|---|---|
| `capabilityId` | Kararlı, benzersiz, implementation isminden bağımsız kimlik |
| `businessOutcome` | Kullanıcı açısından çözülen işin tek cümlelik tanımı |
| `ownerBoundary` | Yeteneğin iş kurallarını sahiplenen mevcut domain/runtime sınırı |
| `requiredEntities` | Entity Resolution tarafından çözülmesi gereken typed referanslar |
| `requiredContext` | Context Resolution tarafından sağlanacak minimum context |
| `supportedStrategies` | İzin verilen answer/reasoning/draft/approval/execution yolları |
| `executionBindings` | Mevcut runtime ve varsa registered action'a deklaratif eşleme |
| `availability` | Capability'nin kullanılabilirlik koşulları; permission kararı değildir |
| `version` | Contract değişikliklerinin izlenebilir sürümü |

Alan adları bir TypeScript API önerisi değildir; kalıcı semantik gereksinimleri ifade eder.

## Capability → Runtime eşleşmesi

Eşleşme tek yönlüdür:

```text
Conversation Understanding
        ↓
Capability Resolution
        ↓
Capability Registry entry
        ↓
Execution Strategy
        ↓
Bir veya daha fazla mevcut runtime contract'ı
```

- Bir capability birden fazla runtime aşaması gerektirebilir.
- Bir runtime birden fazla capability'ye hizmet verebilir.
- Capability Resolution yalnızca capability seçer; doğrudan runtime veya handler çalıştırmaz.
- Execution Strategy, registry'nin izin verdiği yollar arasından bu istek için uygun olanı seçer.
- Runtime binding, permission veya approval sonucu değildir. Policy değerlendirmesi Execution Runtime sınırında ayrıca yapılır.
- Action Registry, capability registry değildir. Action Registry executable Surface/Domain action metadata'sını; Capability Registry iş yeteneklerini tanımlar.

## Resolution kuralları

1. Yalnızca registry'de kayıtlı capability seçilebilir.
2. Seçim, Conversation Understanding tamamlandıktan sonra yapılır.
3. Bir istek sıfır, bir veya birden çok aday üretebilir; yürütme için tek, açıklanabilir primary capability gerekir.
4. Güven yeterli değilse resolver tahminde bulunmaz; clarification veya no-capability sonucu üretir.
5. Entity ve context verisi capability seçimini geriye dönük değiştirmez. Gereksinim karşılanmıyorsa strategy durur veya clarification ister.
6. Capability kimliği model/provider/tool isminden bağımsız kalır.
7. Bir action'ın kayıtlı olması, onu çağıran bir capability'nin otomatik olarak mevcut olduğu anlamına gelmez.
8. Capability eklemek pipeline sırasını, policy kurallarını veya runtime bağımlılık yönünü değiştiremez.

## Değişiklik yönetimi

- Yeni capability, mevcut bir iş yeteneğinin yalnızca farklı UI veya dil varyasyonuysa eklenmez.
- Yeni kayıt owner boundary, entity/context gereksinimleri ve execution bindings tanımlanmadan kabul edilmez.
- Binding değişikliği davranış değişikliğidir; yalnızca mimari belge güncellemesi olarak ele alınamaz.
- Capability kaldırma veya anlamını değiştirme, kullanan strategy ve audit kayıtlarının geriye dönük yorumlanabilirliğini korumalıdır.
- Capability Registry hiçbir prompt içinde gizli bir liste olarak tutulamaz; model seçimi registry otoritesinin yerine geçemez.

## Bugünkü implementation durumu

Repository'de Conversation Understanding ve Action Registry mevcut ayrı sınırlar olarak görülmektedir. Bu dosya bağımsız bir Executive Capability Registry implementasyonunun mevcut olduğunu iddia etmez ve bu görev kapsamında böyle bir implementation oluşturmaz. Gelecekteki implementation bu sözleşmeyi izlemeli ve mevcut Action Runtime metadata'sını çoğaltmamalıdır.
