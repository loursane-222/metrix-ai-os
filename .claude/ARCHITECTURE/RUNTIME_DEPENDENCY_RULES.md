# Runtime Dependency Rules

## Temel yön

Bağımlılıklar pipeline yönünde ilerler. Üst seviye orchestration, alt seviye contract'ları çağırabilir; alt seviye runtime'lar yukarıdaki seçim katmanlarını çağırmaz. Shared types ve saf yardımcılar bağımlılık yönünü tersine çevirmek için kullanılmaz.

```text
Understanding
  → Capability Resolution
    → Entity / Context Resolution
      → Execution Strategy
        → Executive Context / Executive OS
          → Execution Runtime and/or Prompt Bridge
            → Language Model
```

## İzin verilen çağrılar

| Çağıran | Çağırabilir | Koşul |
|---|---|---|
| Request orchestrator | Pipeline aşamalarının public contract'ları | Normatif sıra ve branch kararı korunur |
| Conversation Understanding | Kendi classifier gateway/parser veya deterministik fast-path'i | Yalnızca understanding sonucu üretir |
| Capability Resolution | Capability Registry | Read-only metadata resolution |
| Entity Resolution | Entity lookup için yetkili domain query contract'ları | Organization scope ve typed result korunur |
| Context Resolution | Page Context ve gerekli read-only context provider'ları | Capability'nin ilan ettiği minimum ihtiyaçlarla sınırlı |
| Executive Operating Context | Mevcut intelligence/context builder ve açık write policy ile tanımlı senkronizasyonlar | Diagnostics ve policy görünür kalır |
| Executive Operating System | Kendi reasoning gateway/parser'ları ve tanımlı modeller | Typed executive intelligence üretmek için |
| Draft Runtime | Action Registry ve Page Context Runtime | Surface class doğrulaması, argument resolution ve staleness için |
| Policy/Approval Runtime | Action Registry ve Approval Store abstraction | Permission/risk/approval lifecycle için |
| Execution Runtime | Action Registry, Policy Engine, handler registry, idempotency, operation, audit ve outbox store contract'ları | Sabit execution alt pipeline'ı içinde |
| Domain handler | Kendi domain service/repository contract'ları | Yalnızca validated execution envelope kapsamında |
| Prompt Bridge | Önceden üretilmiş typed executive/context değerleri ve saf composer'lar | Seçim veya side effect olmadan |
| AI gateway/provider adapter | Prompt/render contract ve provider | Model çağrısı sınırında |

## Yasak çağrılar

- **Executive Operating System → Action Runtime:** EOS doğrudan action çalıştıramaz. Öneri veya next move executable authority değildir.
- **Executive Operating System → repository/Prisma:** Executive reasoning persistence detayını sahiplenemez.
- **Prompt Bridge → Capability Resolution:** Prompt Bridge capability seçemez veya değiştiremez.
- **Prompt Bridge → Action/handler/repository:** Prompt hazırlama katmanı side effect başlatamaz.
- **Language Model → business logic:** Model permission, risk, approval, strategy veya mutation kararının otoritesi olamaz.
- **Language Model → repository/tool/handler:** Model çıktısı doğrudan kalıcı işe bağlanamaz; typed ve policy kontrollü runtime sınırından geçmelidir.
- **Execution Runtime → Conversation Understanding/Capability Resolution:** İcra katmanı kullanıcının ne demek istediğini yeniden yorumlayamaz.
- **Execution Runtime → Draft Runtime:** Domain execution draft state'i okuyamaz veya yönetemez; resolved request public contract üzerinden gelir.
- **Draft Runtime → Execution Runtime/domain handler:** Draft commit execution başlatamaz; yalnızca resolved domain action request üretir.
- **Page Context Runtime → repository/Execution Runtime:** Page context entity authority veya action trigger değildir.
- **Approval Runtime → handler/repository:** Approval lifecycle işi yürütmez.
- **Capability Resolution → Action handler:** Capability seçimi execution değildir.
- **Context Resolution → Capability Resolution sonucunu değiştirme:** Eksik context bir stop/clarification sonucudur, gizli reroute gerekçesi değildir.
- **Domain handler → Prompt Bridge/Language Model:** Domain mutation doğal dil katmanına bağımlı olamaz.

## Katman ihlali örnekleri

### İhlal: Prompt içinde action seçimi

Modelden serbest metinle “hangi capability/action çalışmalı?” cevabı alıp doğrudan handler çağırmak; Capability Registry, Execution Strategy ve Policy sınırlarını atlar.

**Doğru sınır:** Capability deterministik/typed resolver ile seçilir; model gerekiyorsa yalnızca aday sinyal üretir. Action, registry ve execution contract üzerinden doğrulanır.

### İhlal: EOS'tan müşteri güncelleme

Executive recommended next move üretildikten sonra EOS servisinin customer repository'yi doğrudan güncellemesi reasoning ile mutation'ı birleştirir.

**Doğru sınır:** Öneri typed çıktı olur. Strategy gerekiyorsa draft/approval/domain execution planlar; customer handler yalnızca Execution Runtime tarafından çağrılır.

### İhlal: Page Context'i entity doğrulaması saymak

Ekrandaki `customerId` bulunduğu için entity'nin var ve actor'ın yetkili olduğunu varsaymak UI state'ini domain otoritesine dönüştürür.

**Doğru sınır:** Page Context argument-resolution kaynağıdır. Entity ve permission doğrulaması yetkili server/domain sınırlarında yapılır.

### İhlal: Draft commit sırasında persistence

`commitDraft()` içinde repository update çalıştırmak Draft Runtime'ın geçici state sınırını bozar ve policy/approval/idempotency aşamalarını atlar.

**Doğru sınır:** Commit yalnızca resolved domain action request üretir; kalıcı iş Execution Runtime'da başlar.

### İhlal: Model cevabını approval saymak

“Evet, yap” metnini action/input/actor bağından bağımsız genel grant olarak kullanmak approval bütünlüğünü bozar.

**Doğru sınır:** Approval grant action, actor, organization, target, normalized input hash, expiry ve single-use semantiğine bağlıdır.

### İhlal: Execution Runtime içinde strategy seçimi

Handler bulunamadığında runtime'ın başka bir action seçmesi veya answer-only moda dönmesi capability/strategy sahipliğini icra katmanına taşır.

**Doğru sınır:** Execution Runtime typed failure döndürür; üst orchestrator yalnızca önceden tanımlı strategy contract'ına göre response üretir.

## Import ve composition kuralları

- Composition root domain handler wiring'i yapabilir; generic Execution Runtime domain implementasyonlarını import etmez.
- Runtime'lar başka bir runtime'ın internal dosyasına değil public contract/barrel sınırına bağımlanmalıdır.
- Type-only dependency, yasak bir semantik bağımlılığı meşru kılmaz.
- Ortak utility içine routing, permission veya mutation mantığı saklanamaz.
- Yeni bir adapter, dependency yönünü tersine çevirmeden interface'i implemente eder.
- Circular runtime dependency yasaktır.

## Review kontrolü

Her Executive Runtime değişikliğinde şu sorular cevaplanmalıdır:

1. Çağrı pipeline yönünde mi?
2. Çağıran katman bu karara gerçekten sahip mi?
3. Public typed contract kullanılıyor mu?
4. Model çıktısı deterministik bir otoritenin yerine mi geçirilmiş?
5. Draft, approval ve execution lifecycle'ları ayrık mı?
6. Handler, store veya provider composition root dışında sızdırılmış mı?
7. Fast-path aynı sorumluluk ve sonuç contract'ını koruyor mu?
