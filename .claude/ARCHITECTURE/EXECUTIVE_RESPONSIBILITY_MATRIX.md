# Executive Responsibility Matrix

## Kullanım sözleşmesi

Bu matris runtime ve mimari aşamaların tek sorumluluklarını tanımlar. Başlıklar bağımsız bir implementasyon modülünün bugün var olduğunu garanti etmez. Her sınır yalnızca aşağıdaki iki alt başlıkla tanımlanır.

## Conversation Understanding

### Responsible For

- Kullanıcı mesajını konuşma türü, motivasyon, şirket ilgisi, action beklentisi, güven ve önerilen ele alış biçimi bakımından sınıflandırmak.
- Belirsizliği ve clarification ihtiyacını görünür kılmak.
- Düşük riskli, deterministik fast-path sonuçlarını aynı typed contract içinde üretmek.

### Not Responsible For

- Capability, entity, tool, handler veya runtime seçmek.
- Şirket bağlamı toplamak, executive reasoning üretmek veya action çalıştırmak.
- Permission, risk veya approval kararı vermek.

## Executive Capability Resolution

### Responsible For

- Conversation Understanding sonucunu tek ve kayıtlı bir iş yeteneğine ya da açıkça “capability yok” sonucuna eşlemek.
- Capability girdisi, sahibi, olası execution biçimleri ve gerekli context/entity gereksinimlerini registry metadata'sından çözmek.
- Belirsiz veya birbiriyle yarışan eşleşmelerde güvenli, açıklanabilir sonuç üretmek.

### Not Responsible For

- Capability işini yürütmek, tool/handler çağırmak veya doğal dil yanıtı yazmak.
- Entity varlığını doğrulamak, şirket context'i toplamak veya executive reasoning yapmak.
- Registry dışında ad hoc capability icat etmek.

## Entity Resolution

### Responsible For

- Seçilmiş capability'nin ihtiyaç duyduğu kullanıcı referanslarını typed entity reference'a dönüştürmek.
- Organization scope, aday belirsizliği ve kimlik çözümleme güvenini korumak.
- Eksik veya çok anlamlı hedefi açık bir sonuç olarak üst akışa döndürmek.

### Not Responsible For

- Capability veya execution strategy seçmek.
- Entity üzerinde mutation yapmak veya permission/approval vermek.
- Tahmine dayalı bir ID üretmek ya da Page Context'i entity varlığının otoritesi saymak.

## Context Resolution

### Responsible For

- Seçilmiş capability ve çözülmüş entity için gerekli request, conversation, page, memory ve organization context referanslarını çözmek.
- Context kaynaklarını, sürümünü, freshness ve güven bilgisini korumak.
- Gerekli ve opsiyonel context eksiklerini ayırmak.

### Not Responsible For

- Capability veya strateji seçmek.
- Executive intelligence bileşenlerini üretmek veya model prompt'u hazırlamak.
- Page context snapshot'ını permission ya da entity existence kanıtı saymak.

## Execution Strategy

### Responsible For

- Çözülmüş capability'nin bu istek için answer-only, clarification, executive reasoning, draft, approval bekleme veya domain execution yollarından hangisini izleyeceğini belirlemek.
- Capability contract, çözümleme güveni ve güvenlik kısıtlarından deterministik bir execution planı üretmek.
- Gerekli aşamaları açıkça `run`, `skip` veya `stop` olarak işaretlemek.

### Not Responsible For

- İşin kendisini yürütmek, şirket context'i üretmek veya model cevabı yazmak.
- Policy/permission kararını taklit etmek.
- Capability Resolution sonucunu değiştirmek.

## Executive Operating Context

### Responsible For

- Organization kapsamındaki memory, kişi, teklif, ödeme, tahsilat, hedef, sinyal, karar ve diğer mevcut intelligence kaynaklarını typed bir işletim bağlamında bileştirmek.
- Kaynak hatalarını, confidence/data-quality bilgisini ve kontrollü write policy'lerini görünür tutmak.
- Executive reasoning ve prompt composition için tekil, tutarlı context sunmak.

### Not Responsible For

- Kullanıcı mesajından capability veya execution strategy seçmek.
- Doğal dil yanıtı üretmek.
- Action handler çalıştırmak veya modelden gelen komutları uygulamak.

## Executive Operating System

### Responsible For

- Executive context, company model, philosophy ve world model üzerinde yönetici muhakemesi üretmek.
- Reasoning ve recommended next move gibi typed executive intelligence çıktıları oluşturmak.
- Öğrenme döngüsünü kendi tanımlı sınırları içinde beslemek.

### Not Responsible For

- Capability seçmek veya Conversation Understanding'i yeniden sınıflandırmak.
- Action Runtime, domain handler, repository veya Prisma'yı doğrudan çağırmak.
- Permission, approval veya kalıcı mutation kararı vermek.

## Prompt Bridge

### Responsible For

- Önceden seçilmiş ve üretilmiş executive intelligence/context alanlarını model için kararlı, typed ve sınırlı bir manager context'e dönüştürmek.
- Confidence ve data-quality sinyallerini kaybetmeden prompt composition sınırına taşımak.
- Eksik opsiyonel intelligence'ı güvenli biçimde temsil etmek.

### Not Responsible For

- Capability, entity veya execution strategy seçmek.
- Yeni iş gerçeği, öneri otoritesi veya permission üretmek.
- Action çalıştırmak ya da persistence yapmak.

## Language Model

### Responsible For

- Verilen instruction ve doğrulanmış context içinde doğal dil veya şemalı reasoning çıktısı üretmek.
- Belirsizliği, eksik bilgiyi ve istenen iletişim tonunu verilen contract'a göre ifade etmek.
- Deterministik runtime'ların tüketebileceği durumlarda yalnızca tanımlı şemaya uygun aday çıktı üretmek.

### Not Responsible For

- Executive Runtime olmak, capability/strategy/policy seçmek veya business rule koymak.
- Entity existence, permission, approval, idempotency ya da data correctness garantisi vermek.
- Tool, handler, repository veya kalıcı mutation üzerinde doğrudan otorite sahibi olmak.

## Action Registry

### Responsible For

- Mevcut Surface ve Domain action'ların typed metadata'sını tutmak.
- Action class, owner module, input schema, base risk, permission set, approval policy ve reversibility metadata'sı için kaynak olmak.
- Kayıtlı action tanımlarının bütünlüğünü korumak.

### Not Responsible For

- Executive capability registry yerine geçmek.
- Action çalıştırmak, handler çözmek veya repository bilmek.
- Kullanıcı niyeti veya execution strategy seçmek.

## Page Context Runtime

### Responsible For

- Kullanıcının güncel çalışma yüzeyini immutable, versioned snapshot olarak tutmak.
- Draft argument resolution ve staleness kontrolü için mevcut page context'i sunmak.
- Context create, replace, update, clear ve comparison işlemlerini yönetmek.

### Not Responsible For

- Entity'nin gerçekten var olduğunu, kullanıcının yetkili olduğunu veya action'ın güvenli olduğunu garanti etmek.
- Repository sorgulamak, action çalıştırmak veya capability seçmek.
- Executive Operating Context yerine geçmek.

## Draft Runtime

### Responsible For

- Geçici Surface action/draft state'ini, baseline'ı, diff'i ve context uyumunu yönetmek.
- Yalnızca Surface class action'ları kabul etmek.
- Commit sırasında çalıştırma başlatmadan `ResolvedDomainActionRequest` üretmek.

### Not Responsible For

- Kalıcı veri değiştirmek, Domain Action çalıştırmak veya handler/repository çağırmak.
- Permission, risk veya approval kararı vermek.
- Capability veya execution strategy seçmek.

## Approval Runtime

### Responsible For

- Mevcut implementasyonda Policy Engine ve Approval Service sınırları içinde permission, runtime risk ve approval lifecycle kararlarını deterministik olarak yönetmek.
- Approval'ı action, actor, organization, target, normalized input hash, süre ve tek kullanımla bağlamak.
- Allow, deny ve requires-approval sonuçlarını doğrulanabilir biçimde üretmek.

### Not Responsible For

- Action'ı veya handler'ı çalıştırmak.
- Kullanıcı niyetini, capability'yi ya da executive strategy'yi belirlemek.
- Serbest metin model onayını geçerli approval grant saymak.

## Action / Execution Runtime

### Responsible For

- Kayıtlı Domain Action'ı sabit execution pipeline'ıyla çalıştırmak.
- Registry lookup, input validation, policy/approval verification, idempotency, operation, handler, audit ve outbox sınırlarını koordine etmek.
- Typed execution result veya typed failure üretmek.

### Not Responsible For

- Capability, entity veya strategy seçmek; executive reasoning yapmak.
- Surface draft state'i yönetmek.
- Domain handler implementasyonlarını bilmek veya bypass ederek repository/Prisma çağırmak.

## Customer Runtime

### Responsible For

- Mevcut customer edit surface ve customer domain handler sınırlarında customer'a özgü validation, draft entegrasyonu ve domain mutation davranışını sahiplenmek.
- Genel runtime contract'larına typed customer input/result sağlamak.
- Customer domain event ve hata semantiğini domain sınırında tutmak.

### Not Responsible For

- Genel capability, prompt, policy, approval veya execution altyapısını yeniden uygulamak.
- Başka domain'lerin iş kurallarını sahiplenmek.
- Action Registry, Draft Runtime veya Execution Runtime'ın genel sorumluluklarını bypass etmek.
