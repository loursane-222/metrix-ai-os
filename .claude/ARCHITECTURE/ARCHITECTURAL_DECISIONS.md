# Architectural Decisions

Bu dosya Executive Runtime Architecture Decision Record'larının kalıcı kaydıdır. Kayıtlar normatiftir. Bir kararın değişmesi yeni bir ADR ile yapılır; eski kayıt silinmez, yeni kayıt tarafından superseded olarak işaretlenir.

## ADR-001 — METRIX is not a chatbot

- **Status:** Accepted
- **Context:** METRIX kullanıcıyla konuşur; ancak ürünün değeri yalnızca mesaj üretmek değil, şirket bağlamını anlamak, yönetici muhakemesi oluşturmak ve kontrollü işleri yürütmektir. “Chatbot” çerçevesi conversation UI'ını sistem mimarisiyle eşitler ve kalıcı iş sorumluluklarını model katmanına iter.
- **Decision:** METRIX bir Executive AI Operating System olarak tasarlanır. Conversation bir giriş/çıkış yüzeyidir; capability, context, reasoning, policy, approval ve execution bağımsız mimari otoritelerdir.
- **Consequences:** Yeni özellikler prompt eklemekle tamamlanmış sayılmaz. Her iş yeteneği capability, context, strategy ve gerekirse execution contract'larıyla tanımlanır. UI kanalı değişse de runtime sorumlulukları korunur.

## ADR-002 — Language Model is not the Executive Runtime

- **Status:** Accepted
- **Context:** Language Model güçlü bir reasoning ve dil üretim primitive'idir; fakat nondeterministik çıktısı permission, entity doğruluğu, approval, idempotency veya mutation garantisi sağlayamaz.
- **Decision:** Language Model Executive Runtime değildir. Model yalnızca kendisine verilen sınırlı context ve şema içinde çıktı üretir. İş mantığı, capability/strategy seçimi ve execution otoritesi deterministik runtime contract'larında kalır.
- **Consequences:** Model çıktısı doğrudan handler veya repository çağırmaz. Executable adaylar typed validation, registry ve policy sınırlarından geçer. Provider veya model değişimi business contract'ı değiştirmez.

## ADR-003 — Capability Resolution precedes Executive Reasoning

- **Status:** Accepted
- **Context:** Executive reasoning capability seçmeden önce yapılırsa model, hangi iş yeteneğinin gerektiğini örtük biçimde seçer; gereksiz context toplama ve yanlış domain routing riski oluşur.
- **Decision:** Conversation Understanding sonrasında Capability Resolution tamamlanır; Executive Operating Context ve Executive Operating System yalnızca seçilmiş capability ve strategy gerektiriyorsa devreye girer.
- **Consequences:** Executive reasoning bir router değildir. No-match veya ambiguous capability sonucu clarification/no-op ile bitebilir. Yeni capability eklemek reasoning prompt'una gizli routing kuralı eklemek anlamına gelmez.

## ADR-004 — Executive Operating Context composes intelligence but never selects capabilities

- **Status:** Accepted
- **Context:** Executive Operating Context çok sayıda organization ve intelligence kaynağını bir araya getirir. Bu veri zenginliği, katmanın kullanıcı niyetini yorumlaması veya capability seçmesi için gerekçe değildir.
- **Decision:** Executive Operating Context yalnızca istenen intelligence ve bağlamı typed çıktı halinde bileştirir; capability ya da execution strategy seçmez ve değiştirmez.
- **Consequences:** Context eksikliği diagnostics/confidence veya stop koşulu üretir; gizli rerouting üretmez. Context builder'a capability classifier eklenmez. Kaynak toplama, açık write policy dışında side effect üretmez.

## ADR-005 — Execution Runtime performs work but never decides strategy

- **Status:** Accepted
- **Context:** Execution Runtime registry, validation, policy, approval, idempotency, handler, audit ve outbox garantilerini koordine eder. Aynı katmanın “ne yapılmalı?” sorusunu cevaplaması güvenlik ve test edilebilirlik sınırlarını karıştırır.
- **Decision:** Execution Runtime yalnızca kendisine verilmiş typed Domain Action request'ini sabit pipeline ile yürütür. Capability, entity intent veya answer/draft/approval/execution strategy'si seçmez.
- **Consequences:** Unsupported veya invalid istek typed failure olur; runtime başka action'a kendiliğinden geçmez. Strategy üst orchestration sınırında kalır. Handler'lar yalnızca registry üzerinden çözülür.

## ADR kayıt şablonu

Gelecekteki kayıtlar aşağıdaki yapıyı kullanır:

```text
## ADR-NNN — Karar başlığı

- Status: Proposed | Accepted | Superseded by ADR-NNN
- Context: Kararı zorunlu kılan problem ve kısıtlar
- Decision: Tek, açık ve test edilebilir mimari karar
- Consequences: Kabul edilen etkiler, trade-off'lar ve uygulama kuralları
```
