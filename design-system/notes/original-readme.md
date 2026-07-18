# METRIX Design Assets

Bu klasör üç onaylı görsel varlığın sürümünü içerir:

- `global/primary-orb.svg`
- `global/executive-dock.svg`
- `global/executive-dock-transparent.png`

## Önerilen proje konumu

`/Users/mac/Projects/metrix-ai-os/public/assets/metrix/`

## Kullanım ilkesi

Bu dosyalar METRIX'in resmi görsel varlıklarıdır. Claude bunları yeniden çizmemeli, CSS ile yaklaşık üretmemeli veya başka ikonlarla değiştirmemelidir.

Next.js örneği:

```tsx
import Image from "next/image";

<Image
  src="/assets/metrix/metrix-primary-orb.svg"
  alt="METRIX"
  width={132}
  height={132}
  priority
/>
```

Dock için öneri:
- SVG dekoratif shell olarak kullanılabilir.
- Gerçek navigasyon butonlarını erişilebilir HTML öğeleri olarak SVG'nin üstüne bindirmek daha doğrudur.
- Statik SVG metinleri yerine uygulama içindeki etiketler kullanılacaksa, bu SVG shell olarak ayrıştırılabilir.
