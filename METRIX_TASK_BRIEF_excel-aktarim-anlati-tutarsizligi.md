# GÖREV METNİ — Excel/CSV İçe Aktarma: Çalışma Alanı Açılıyor Ama METRIX Bazen "Bağlı Değil" Diyor

**Kime:** Codex
**Fazın türü:** Araştırma + odaklı düzeltme. Bu, `96ddf61` ("excel'den içe aktar" domain-belirtmeden fabrikasyon düzeltmesi) ve bu oturumdaki apostrof düzeltmesinin (bkz. aşağıdaki "Bu oturumda zaten düzeltildi" bölümü) devamı — o ikisi gerçek ve doğrulanmış düzeltmelerdi, ama üçüncü, kök nedeni bulunamamış bir sorun daha var.

## Bağlam — önceki oturumdan devam

Kullanıcı üç canlı sorun bildirdi:
1. ~~"excel'den içe aktar" (domain belirtmeden) → uydurma "bağlı değil" cevabı~~ — `96ddf61` ile düzeltildi, push'landı.
2. "excel'den müşteri aktar" gibi TAM DOĞRU cümle bile bazen reddediliyor.
3. "+" menüsündeki "Excel/CSV İçe Aktar" → "Müşteri" butonu bazen hiçbir şey açmıyor.

## Bu oturumda zaten düzeltildi (dokunma, sebebini bil)

**Kök neden bulundu ve doğrulandı:** macOS/iOS'un "akıllı tırnak" özelliği düz kesme işaretini (`'`, U+0027) tipografik olana (`’`, U+2019) çeviriyor. 9 domain'in import regex'i ve genel fallback regex'i SADECE düz kesme işaretini kabul ediyordu (`'?[dt]en`). Şu 10 dosyada `'?[dt]en` → `['’]?[dt]en` olarak düzeltildi:

```
src/lib/conversation-extensions/customer-import-conversation-extension.ts
src/lib/conversation-extensions/general-import-conversation-extension.ts
src/lib/conversation-extensions/invoice-import-conversation-extension.ts
src/lib/conversation-extensions/offer-import-conversation-extension.ts
src/lib/conversation-extensions/payment-import-conversation-extension.ts
src/lib/conversation-extensions/product-import-conversation-extension.ts
src/lib/conversation-extensions/order-import-conversation-extension.ts
src/lib/conversation-extensions/stock-import-conversation-extension.ts
src/lib/conversation-extensions/supplier-import-conversation-extension.ts
src/lib/conversation-extensions/production-import-conversation-extension.ts
```

Doğrulama: `npx tsc --noEmit` temiz, `npm test` 2484 geçti, `npm run build` başarılı, ayrıca yerel dev sunucusunda tarayıcıdan canlı test edildi — hem düz hem tipografik kesme işaretiyle "excel'den müşteri aktar" / "excel'den tedarikçi aktar" artık doğru şekilde ilgili İçe Aktar sihirbazını açıyor ve doğru cevabı veriyor ("İlgili kaydı çalışma alanında açtım, sağ tarafta inceleyebilirsiniz."). Bu commit henüz push'lanmadı — sıradaki commit/push bu düzeltmeyi içerecek.

**Bunu tekrar düzeltmeye çalışma, zaten tamam.** Görevin aşağıdaki, hâlâ açık olan üçüncü soruna odaklanması gerekiyor.

## Hâlâ açık: kök nedeni bulunamadı sorun

Aynı oturumda, apostrof düzeltmesini doğrularken **bir kez** şunu gözlemledim (yeniden üretilebilirliği düşük, ama gerçek — ekran görüntüsüyle doğrulandı):

- Ortam: yerel dev sunucusu (`npm run dev`), tarayıcı mobil viewport'a (375×812) resize edilmiş, gönder butonuna DOM `.click()` ile (gerçek fare tıklaması değil, JS'ten tetiklenmiş sentetik tıklama — araç kısıtlaması nedeniyle) tıklanarak "excel'den fatura aktar" yazıldı.
- **Çalışma alanı doğru açıldı**: "Excel/CSV'den Fatura Aktar" sihirbazı, doğru başlık ve açıklamayla ekranda görünür şekilde geldi.
- **Ama METRIX'in sohbet cevabı yanlıştı**: "Excel veya CSV doğrudan içe aktarma şu anda bağlı değil; ancak desteklenen belge yükleme akışını kullanarak…" — yani tam olarak `96ddf61`'in düzelttiği fabrikasyon deseni, ama bu sefer domain BELİRTİLMİŞ ("fatura") halde ve gerçek eylem (çalışma alanını açma) BAŞARILI olmuşken.
- Aynı oturumda hemen öncesinde, aynı mekanizmayla ("excel'den müşteri aktar", "excel'den tedarikçi aktar" — hem masaüstü genişlikte gerçek tıklama/klavye ile hem de "+" menü butonuyla) **doğru** deterministik cevap alındı: "İlgili kaydı çalışma alanında açtım, sağ tarafta inceleyebilirsiniz."

**Önemli:** kullanıcının orijinal 2. ve 3. şikayeti muhtemelen büyük ölçüde apostrof hatasıydı (artık düzeltildi) ve/veya kullanıcı çalışma alanının açıldığını fark etmemiş olabilir çünkü METRIX'in kendi sözü "bağlı değil" diyordu — panel açık olsa bile kullanıcı buna güvenip "hiçbir şey olmadı" sonucuna varmış olabilir. Yani bu üçüncü sorun, ikinci ve üçüncü şikayetin GERÇEK kaynağı olabilir; ya da tek seferlik, mobil viewport + sentetik tıklama testine özgü bir yapay olabilir. **Bunu netleştirmek bu görevin ilk işi.**

## Mimari not — neden bu mümkün olabilir (doğrulanmış kod okuması, ama kesin kanıtlanmamış teori)

`src/app/api/ai/chat/route.ts` akışı:
1. Satır ~921: `streamWithAiGateway(...)` çağrılır, model HER ZAMAN çalışır (deterministik bir handoff olsa bile atlanmıyor).
2. Satır ~1097-1109: modelin ham metni `for await (const chunk of streamHandle.textStream)` ile **anlık olarak** `phase: "primary"` chunk'ları halinde tarayıcıya stream edilir.
3. Satır ~1177-1222: SADECE bu stream tamamen bittikten SONRA, `conversationExtensionHandoff` varsa `aiContent` `buildCustomerCreateHandoffMessage(...) ?? buildUniversalHandoffMessage(...)` ile deterministik bir cümleyle **override edilir** (satır 1214: `aiContent = deterministicHandoffMessage;`).
4. Satır ~1285: düzeltilmiş `aiContent`, `"done"` event'inin `ai.content` alanında istemciye gönderilir.
5. İstemci tarafı (`src/components/metrix-tab/MetrixChatTab.tsx:717`): `finalContent = resolveNavigationAssistantContent(ai.content || streamed, navigationCompletion)`. `resolveNavigationAssistantContent` (`src/lib/conversation-extensions/executive-navigation-command.ts:15-18`) incelendi: navigasyon `COMPLETED` ise `content`'i (yani `ai.content`'i) OLDUĞU GİBİ döndürüyor, üzerine yazmıyor. Yani bu fonksiyon şüpheli değil — teorik olarak nihai balon `ai.content`'i (düzeltilmiş metni) göstermeli.

**Bu, gözlemlenen fabrikasyonu TAM olarak açıklamıyor** — çünkü `ai.content` düzeltilmiş olmalıydı. Yani ya:
- (a) `conversationExtensionHandoff` o istekte server'a HİÇ gitmemişti (yani `extensionResult.handoff` client tarafında boştu), her ne kadar `navigate()` yan etkisi çalışıp paneli açmış olsa da — bu iki şey `invoiceImportConversationExtension.execute()` içinde aynı `if` bloğunda birlikte döndüğü için (regex eşleşirse ikisi de olur, biri olup diğeri olmaz diye bir şey kodda yok), BU TEORİ garip ama başka bir extension'ın (bkz. aşağıdaki kontrol listesi) araya girip yanlış/boş bir handoff döndürmüş olması mümkün, VEYA
- (b) stream sırasında istemcide "primary" chunk'lar zaten ekrana yazılmış olabilir ve `"done"` event'i her nedense hiç işlenmemiş/geç işlenmiş olabilir (ör. `AbortController` erken abort etmiş olabilir — `read_network_requests` bu istekte `200 OK [FAILED: net::ERR_ABORTED]` gösterdi, ama bu diğer BAŞARILI isteklerde de aynı şekilde görünüyordu, yani muhtemelen normal bir stream-kapatma deseni, ama %100 emin değilim).

## Yapılacaklar

1. **Önce yeniden üretmeyi doğrula.** Gerçek bir tarayıcı sekmesinde (sentetik `.click()` değil, gerçek fare/dokunmatik tıklama), yerel dev sunucusunda, önce masaüstü sonra mobil viewport'ta, en az 9 domain'in TAMAMINI ("excel'den müşteri aktar", "...ürün aktar", "...fatura aktar", "...tedarikçi aktar", "...tahsilat aktar", "...teklif aktar", "...sipariş aktar", "...stok aktar", "...üretim aktar") hem yazılı komut hem de "+" menü butonuyla en az 3'er kez dene. Hangi domain(ler)de, hangi koşullarda (viewport, art arda kaç komuttan sonra, taze sohbet mi yoksa mevcut sohbete devam mı) fabrikasyon tekrar ediyor, kaydet.
2. Eğer yeniden üretilebiliyorsa: `executeActiveConversationExtension` (`src/lib/conversation-extensions/active-conversation-extension.ts:89-116`) içine, hangi extension'ın hangi sonucu döndürdüğünü gösteren geçici bir `console.debug` koy (veya mevcut telemetry event'lerinden yararlan — `emitBusinessNavigationTelemetry` zaten `host_command_received` gibi event'ler basıyor), başarısız senaryoyu tekrar et, `extensionResult.handoff`'un gerçekten dolu olup olmadığını doğrudan gözlemle. Bu, teori (a)'yı kesin olarak kanıtlar/eler.
3. Eğer `extensionResult.handoff` boşsa: `active-conversation-extension.ts:80`'deki extensions dizisinde, `invoiceImportConversationExtension`'dan (veya hangi domain başarısız olduysa onun import extension'ından) ÖNCE gelen ve "fatura"/ilgili domain kelimesini içeren regex'i olan HER extension'ı gözden geçir — özellikle daha önce kontrol edilmemiş olanlar (bu oturumda sadece `invoice-management-conversation-extension.ts` kontrol edildi ve eşleşmediği doğrulandı; diğer ~30 extension kontrol edilmedi).
4. Eğer `extensionResult.handoff` doluysa ama yine de yanlış metin gösteriliyorsa: sorun `route.ts`'nin server tarafında — `conversationExtensionHandoff` request body'sinden nasıl okunduğunu (`readExecutiveNavigationCommandInput` değil, ayrı bir okuma yolu olmalı — grep et) ve `deterministicHandoffMessage` hesaplamasının (satır ~1177) neden `null` kaldığını izle.
5. Kök neden ne olursa olsun, **en küçük düzeltmeyi** uygula — mimarideki "primary stream önce, deterministik override sonra" tasarımını değiştirme (bu, kapsam dışı büyük bir refactor olur ve Anayasa'nın "smallest change" ilkesini ihlal eder) **meğer ki** kanıtlanan kök neden gerçekten bu sıralama olsun; o zaman bile önce daha küçük bir alternatif ara (ör. handoff kesinse primary stream'i hiç göndermeyip doğrudan deterministik metni tek chunk olarak enqueue etmek gibi tek noktalı bir değişiklik, route.ts'nin geri kalanını değiştirmeden).

## Yapılmaması Gerekenler

- Apostrof düzeltmesine dokunma (yukarıda tamam, doğrulandı).
- 9 import extension dosyasının regex'lerini veya handoff şekillerini değiştirme — hepsi birbirinin aynısı ve doğru.
- Kök nedeni netleştirmeden "her ihtimale karşı" birden fazla yer değiştirme yapma — Anayasa'nın Faz Yönetimi ve Kapsam Disiplini kurallarına göre tek, doğrulanmış kök nedene karşı tek düzeltme.

## Kabul Kriterleri

- Yeniden üretim adımı (madde 1) tamamlandı ve sonuç raporda net: "X domain'de Y koşulunda Z kez denendi, fabrikasyon A/B oranında gözlendi" gibi somut sayılar.
- Eğer kök neden bulunduysa: düzeltme yapıldı, aynı repro adımlarıyla en az 10 art arda denemede fabrikasyon gözlenmedi.
- Eğer kök neden BULUNAMADIYSA (zaman kutusu doldu): Anayasa'nın Bug Fix Policy'sine göre dürüstçe "bulunamadı" denip mevcut bulgular raporlanmalı — spekülatif bir "düzeltme" commit'lenmemeli.
- `npx tsc --noEmit`, `npm test`, `npm run build` geçiyor.
- Değişiklik varsa commit edildi (push, kullanıcı onayı olmadan yapılmaz).

## Rapor Beklentisi

Kısa: yeniden üretim sonucu (sayılarla), kök neden (bulunduysa), değişen dosyalar, doğrulama sonuçları, commit hash. Bulunamadıysa: hangi teoriler elendi, hangi teori en olası kaldı, sıradaki adım ne olurdu.
