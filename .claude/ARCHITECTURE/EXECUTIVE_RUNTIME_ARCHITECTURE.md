# Executive Runtime Architecture

## Statü ve kapsam

Bu belge METRIX AI OS Executive Runtime mimarisinin bağlayıcı üst seviye sözleşmesidir. Buradaki “runtime” sözcüğü yalnızca çalışan bir sınıfı veya klasörü değil, açık bir sorumluluk sınırını da ifade edebilir. Bir sözleşme aşamasının adı burada geçiyor diye repository'de aynı adla bağımsız bir modülün mevcut olduğu varsayılmaz.

Bu katman prompt veya ürün dokümantasyonu değildir. Kodun bugün nasıl davrandığını yeniden yorumlamaz; Executive Runtime geliştirmelerinin koruması gereken sınırları tanımlar. Ayrıntılı sıra için `EXECUTION_PIPELINE.md`, çağrı kuralları için `RUNTIME_DEPENDENCY_RULES.md`, sorumluluklar için `EXECUTIVE_RESPONSIBILITY_MATRIX.md` esas alınır.

## Executive Runtime pipeline

Normatif akış:

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

Bu sıra mantıksal bağımlılık sırasıdır. Bağımsız okumalar performans amacıyla paralel yürütülebilir; ancak sonraki bir aşama, önceki aşamanın kararı oluşmadan onun kararını veremez veya geriye doğru sahiplenemez. Bir isteğin bazı aşamalara ihtiyaç duymaması halinde aşama açıkça `not applicable`, `skipped` veya eşdeğer bir sonuç üretir; sonraki aşama eksik bir kararı kendisi üretmez.

## Runtime sorumluluk modeli

Executive Runtime dört ayrı karar türünü birbirine karıştırmaz:

1. **Anlama:** Kullanıcının ne ifade ettiğini Conversation Understanding belirler.
2. **Yönlendirme ve strateji:** Hangi iş yeteneğinin gerektiği Capability Resolution tarafından, hangi çalışma biçiminin uygulanacağı Execution Strategy tarafından belirlenir.
3. **Zekâ ve muhakeme:** Executive Operating Context doğrulanmış bağlamı bileştirir; Executive Operating System bu bağlam üzerinde yönetici muhakemesi üretir.
4. **İcra ve ifade:** Execution Runtime izinli işi deterministik olarak yürütür; Prompt Bridge yalnızca seçilmiş bağlamı model girdisine dönüştürür; Language Model doğal dil üretir.

Bu ayrım, bir isteğin cevap üretmesi ile kalıcı bir iş yapmasının aynı şey olmadığını garanti eder.

## Executive AI prensipleri

- METRIX bir chatbot değil, şirket bağlamında anlayan, muhakeme eden ve kontrollü iş yürüten bir Executive Operating System'dir.
- Language Model bir reasoning ve language primitive'idir; sistemin otoritesi, capability router'ı, policy engine'i veya execution runtime'ı değildir.
- Şirket gerçeği prompt içinde icat edilmez. Bağlam kaynaktan çözülür, güven seviyesi korunur ve eksik veri açıkça temsil edilir.
- Kullanıcı niyeti ile uygulanabilir capability ayrı kavramlardır. Anlama sonucu doğrudan bir tool veya handler çağrısına dönüşmez.
- Muhakeme ile icra ayrıdır. Öneri, taslak, onay ve kalıcı mutation aynı lifecycle adımı değildir.
- Yetki, risk, onay, input validation, idempotency ve audit gibi icra garantileri deterministik runtime'larda kalır.
- Model çıktısı tek başına executable authority değildir. Çalıştırılabilir istek typed, doğrulanmış ve policy kontrollü olmalıdır.
- Runtime'lar yalnızca ihtiyaç duydukları minimum typed girdiyi alır; başka bir katmanın iç durumunu veya depolama detayını sahiplenmez.
- Düşük güven, eksik entity veya eksik context gizlenmez. Güvenli duruş clarification, no-op, draft veya açık hata olabilir.

## Değiştirilemez mimari kurallar

1. Conversation Understanding, capability seçiminden önce gelir.
2. Capability Resolution, entity/context çözümlemesinden ve Executive Reasoning'den önce gelir.
3. Entity Resolution, doğal dildeki referansı doğrulanmış typed kimliğe dönüştürmeden entity-targeted execution başlatılamaz.
4. Context Resolution, yalnızca seçilmiş capability'nin ihtiyaç duyduğu bağlamı çözer.
5. Execution Strategy; cevap, açıklama, clarification, draft, approval veya domain execution yollarından hangisinin kullanılacağını belirler. Language Model bu stratejiyi değiştiremez.
6. Executive Operating Context zekâyı bileştirir; capability veya strateji seçmez.
7. Executive Operating System muhakeme eder; doğrudan Action Runtime, handler, repository veya Prisma çağırmaz.
8. Execution Runtime işi yürütür; kullanıcı niyeti, capability veya strateji belirlemez.
9. Prompt Bridge seçim yapmaz, iş kuralı uygulamaz ve mutation başlatmaz.
10. Language Model permission, risk, approval, entity existence, idempotency veya mutation kararı için otorite değildir.
11. Draft Runtime kalıcı veri değiştirmez; commit yalnızca çözümlenmiş domain action talebi üretir.
12. Approval doğrulaması, çalıştırılacak action, actor, organization, target ve input ile bağlıdır; genel bir “evet” yetki değildir.
13. Katman atlamak yasaktır. Bir üst katman alt katmanın public contract'ını kullanır; handler'a, store'a veya provider'a kestirme yol açmaz.
14. Yeni capability eklemek mevcut pipeline sırasını değiştirmez; registry eşleşmesini ve ilgili runtime kontratını genişletir.

## Mevcut repository ile bağ

Bugünkü repository bu sözleşmenin çeşitli parçalarını `conversation-understanding`, `executive-context-builder`, `executive-operating-context`, `executive-operating-system`, `executive-prompt-bridge`, AI gateway/provider katmanları ve `action-runtime` içindeki registry, page context, draft, policy/approval ve execution bileşenleriyle gerçekleştirir. Bu belge, mevcut kodda bulunmayan bağımsız servislerin var olduğunu iddia etmez. Gelecekteki bütünleştirme çalışmaları mevcut davranışı taşırken bu sorumluluk sınırlarına yaklaşmalıdır.
