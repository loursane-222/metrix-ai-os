# Workspace Başlık Sızıntısı ve Bildirim Poll Hatası — Uygulama Raporu

## Başlık sızıntısı

`planner.ts` içindeki canonical domain yapılandırmasına her domain için kısa,
Türkçe ve kullanıcıya dönük `subtitle` eklendi. `createWorkspaceDirective` bu
değeri bütün domain-specific factory'lere aktarıyor. Takvimin mevcut “Olaylar,
görevler ve vadeler” alt başlığı korundu.

Bu merkezi çözüm müşteri, tedarikçi, ürün, bildirim, görev, teklif, tahsilat,
fatura, muhasebe, finans, ekip, hedef, sipariş, irsaliye, stok ve şirket
directive'lerini kapsıyor. Entity detaylarında `workspaceIdentity` hâlâ
`entityType · entityId` değerini öncelikli gösteriyor; o davranış değiştirilmedi.

Gerçek müşteri listesiyle doğrulamada hem host başlığında hem workspace kartında
“Aktif müşteri kayıtları” göründü; `customer:customer-list` görünmedi.

## Bildirim toast poll hatası

`MetrixNotificationToast` içindeki bütün poll akışı `try/catch` içine alındı.
Ağ veya JSON okuma hatasında:

- mevcut notification state/queue değiştirilmiyor,
- kullanıcıya görünür hata üretilmiyor,
- interval çalışmaya devam ederek sonraki turda yeniden deniyor,
- hata adı ve mesajı `[MetrixNotificationToast] notification poll failed`
  etiketiyle yapılandırılmış biçimde `console.error` üzerinden loglanıyor.

## Doğrulama

- `npx tsc --noEmit` → geçti.
- Değişen iki kaynak dosyada ESLint → geçti.
- Organization scoping guard → geçti (`74/256/3`).
- Odaklı workspace testleri → 2 dosya, 27 test geçti.
- Tam `npx vitest run` → 293 dosya geçti, 8 atlandı; 2231 test geçti,
  17 atlandı.
- `git diff --check` → geçti.
- Temiz gerçek tarayıcı kanıtı:
  `qa-screenshots/workspace-turkce-alt-baslik-temiz.png`.

Brief gereği commit ve push yapılmadı.
