# Konuşma Eklentileri Gerçek Giriş Noktası Denetimi

## Kapsam ve sonuç

`active-conversation-extension.ts` içindeki altı belirgin domain komutu, eklentiler tek başına çağrılmadan gerçek `executeActiveConversationExtension` girişinden test edildi.

| Domain | Komut | Sonuç | Düzeltme |
|---|---|---|---|
| Customer | `Atlas müşterisini pasife al` | HANDOFF / customers | Gerekmedi |
| Offer | `Atlas teklifini aç` | HANDOFF / quotes | Gerekmedi |
| Task | `yeni görev oluştur: haftalık raporu kontrol et` | HANDOFF / tasks | Gerekmedi |
| Payment | `Atlas için 100 TL tahsilat kaydet` | HANDOFF / payments | Gerekmedi |
| Invoice | `Atlas için 100 TL fatura kes` | HANDOFF / invoices | Gerekmedi |
| Supplier | `yeni tedarikçi ekle` | HANDOFF / suppliers | Önceki diakritik gate düzeltmesiyle çalışıyor |

Yeni test: `src/lib/conversation-extensions/__tests__/all-domains-active-entry.test.ts` — altı domaini gerçek aktif giriş noktasından doğrular.

## Gelecek eklenti standardı

Her yeni conversation extension için izole `.execute()` testinin yanında en az bir `executeActiveConversationExtension` testi zorunludur. Bu kural, yeni domain ekleme PR’larının test kapsamı standardıdır; tek başına extension testi gerçek eklenti sırasını ve sahiplenme davranışını kanıtlamaz.

## Doğrulama

- `npx tsc --noEmit` başarılı.
- Tam Vitest: 276 dosya geçti, 6 atlandı; 2132 test geçti, 15 atlandı.
- Text-quality guard başarılı.
- Organization-scoping guard başarılı.

Bu denetimde yeni domain düzeltmesi gerekmedi; tedarikçi için önceki en dar diakritik gate düzeltmesi gerçek giriş testiyle doğrulandı.
