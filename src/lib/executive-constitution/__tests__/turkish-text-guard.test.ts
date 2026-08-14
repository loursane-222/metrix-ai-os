import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const GUARDED_FILES = [
  "src/lib/executive-awareness/executive-awareness-engine.service.ts",
  "src/lib/executive-brain/executive-decision-package.service.ts",
  "src/lib/executive-constitution/cco.constitution.ts",
  "src/lib/executive-constitution/cfo.constitution.ts",
  "src/lib/executive-constitution/chro.constitution.ts",
  "src/lib/executive-constitution/cmo.constitution.ts",
  "src/lib/executive-constitution/coo.constitution.ts",
  "src/lib/executive-constitution/executive-council-activation.service.ts",
  "src/lib/executive-constitution/executive-council.constitution.ts",
  "src/lib/executive-constitution/general-manager.constitution.ts",
  "src/lib/executive-constitution/sales.constitution.ts",
  "src/lib/executive-daily-briefing-v2/executive-daily-briefing-v2-summary.service.ts",
  "src/lib/executive-decision-engine/executive-decision-engine.service.ts",
  "src/lib/executive-decision-follow-up/executive-decision-follow-up-engine.service.ts",
  "src/lib/executive-focus/executive-focus-engine.service.ts",
  "src/lib/executive-forecasting/cashflow-risk-analyzer.service.ts",
  "src/lib/executive-forecasting/execution-risk-analyzer.service.ts",
  "src/lib/executive-forecasting/executive-forecasting-engine.service.ts",
  "src/lib/executive-narrative/executive-narrative-summary.service.ts",
  "src/lib/executive-reporting/executive-reporting-engine.service.ts",
  "src/lib/executive-scorecard/executive-scorecard-engine.service.ts",
  "src/lib/executive-scorecard/executive-scorecard-summary.service.ts",
] as const;

const ADDITIONAL_BROKEN_WORDS = ["netligi", "musteriye", "satisi", "degildir", "baskisini", "gorunur", "kararlari", "onceligi", "icinde", "goruntulendikten", "guncellenmeli", "soz", "deger", "kosul", "onceliklerini", "gorunuyor", "guvenilir"] as const;

const BROKEN_WORDS = [
  /* source-only guard vocabulary; not user copy. */ "icin", "degil", "gore", "musteri", "surec", "oncelik", "onumuzdeki", "artirmak", "netlesmeden", "yuksek", "dusuk", "gecmis", "gunluk", "calis", "calisma", "hazirla", "guncel", "sonuc", "olustu", "olustur", "guven", "satis", "yonetim", "yonetici", "sirket", "akisi", "karlilik", "karari", "kisilik", "kahramanlik", "karsiligini", "sozun", "kisi", "karistirmaz", "alani", "uzerinden", "gorunurlugu", "buyume", "bugunku", "yakin", "nasil", "artiriyor", "belirsizligi", "kararlarini", "satisa", "uretimi", "baglanmadikca", "acik", "cozmeyi", "dogru", "ulasmak", "edilecegini", "netlestirir", "firsat", "tasir", "onermez", "iliskisi", "okunmali", "alim", "degerlendirilmeli", "uzmanlik", "mudur", "akli", "kontrollu", "kosullu", "yakindan", "iliskiyi", "guveni", "olcum", "bugun", "hizli", "simdi", "kazanimi", "ust", "odeme", "plani", "sikisikligi", "yalin", "kucuk", "uyari", "gorev", "sozu", "donusum", "kayitli", "olmadigi", "hesaplanamadi", "girisi", "gun", "gunde", "planlanmamis", "planli", "birikmis", "orantisiz", "oncelikli", "onerildi", "suredir", "taahhude", "donmedi", "gecti", "netlestirilmeli", "taahhut", "kapanis", "dusurdu", "basarili", "basarisiz", "altinda", "sagligi", "zayif", "guclu", "kisitlari", "basliklarini", "kisa", "gecir", "gecikmis", "onemli", "anlatimi", "siraya", "alinmali", "tarafinda", "gelismelerde", "baslik", "dis", "uyarisi", "basarisizlik", "kaydi", "suresi", "orani", "yansit", "onceki", "kapatildi", "saglik", "baskisi", "aylik", "tabani", "gerceklesme", "acigi", "buyuk", "one", "cikan", "gundeme", "alinan", "sinirli", "giris", "kaynaklari", "okunamadi", "hazirlandi", "once", "zamani", "gerceklesti", "degerlendirme", "degerlendirmesi", "katmani", "gostermiyor", "yukselisi", "baski", "gorunmuyor", "kararini", "baslat", "dususunu", "egitim", "ayrimiyla", "kaybi", "isi", "iliskisinin", "degeri", "sinir", "koyulmali", "adina", "hakli", "insa", "alacaklari", "yazili", "sozlerini", "kisiye", "hukum", "netligini", "kultur", "tasiyicisidir", "isten", "cikarma", "algisi", "kanallarini", "kalir", "yonetmek", "akisini", "cok", "darbogaz", "yavaslatiyor", "yuk", "arasindaki", "gorur", "kararinda", "firsati", "korunmali", "yonetimi", "bakislarini", "alinmaz", "dayanaklarini", "kullanicidadir", "cagirmadan", "secmek", "kullanilir", "kullanicinin", "gercekleri", "cevirir", "konusur", "baglar", "bakisini", "gercegi", "saglikli", "surdurulebilir", "firsatlarini", "dogurur", "tasiyabilecegi", "gunun", "gozden", "adayi", "farkindalik", "duser", "suruklenebilir", "gundur", "alinmamis", "guncellenmemis", "goruntulenen", "kaliyor", "iletisime", "ulasilmasi", "ozeti", "ozet", "olusmadi", "bulunamadi", "kismi", "karsilama", "guc", "basari", "isaretiyor", "dogrulandi",
] as const;

// Explicit allowlist: these contexts intentionally preserve ASCII variants for
// diacritic-free user input matching or stable technical identity. They are not
// user/model output text and changing them would alter behavior.
function isAllowedAsciiContext(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isPropertyAssignment(current) && ts.isIdentifier(current.name) && ["id", "terms"].includes(current.name.text)) return true;
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === "hasAny") return true;
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) && ["replace", "replaceAll", "includes", "startsWith", "endsWith"].includes(current.expression.name.text)) return true;
    current = current.parent;
  }
  return false;
}

function violations(file: string, source: string): string[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: string[] = [];
  const guardedForms = [...BROKEN_WORDS, ...ADDITIONAL_BROKEN_WORDS].flatMap((word) => [word, word[0]!.toUpperCase() + word.slice(1), word.toUpperCase()]);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(${guardedForms.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  function visit(node: ts.Node): void {
    if ((ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) && !isAllowedAsciiContext(node)) {
      for (const match of node.text.matchAll(pattern)) found.push(`${match[0]}@${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}

describe("executive Turkish output text guard", () => {
  it("detects a deliberately broken Turkish output literal", () => {
    expect(violations("probe.ts", 'const message = "Karar icin veri hazır.";')).toContain("icin@1");
  });

  for (const file of GUARDED_FILES) {
    it(`${file} contains no guarded ASCII Turkish output words`, () => {
      expect(violations(file, readFileSync(join(process.cwd(), file), "utf8"))).toEqual([]);
    });
  }
});
