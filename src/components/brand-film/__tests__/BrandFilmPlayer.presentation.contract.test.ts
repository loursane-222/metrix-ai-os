import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const player = readFileSync(join(root, "src/components/brand-film/BrandFilmPlayer.tsx"), "utf8");
const styles = readFileSync(join(root, "src/components/brand-film/BrandFilmPlayer.module.css"), "utf8");

describe("BrandFilmPlayer approved V1 contract", () => {
  it("preserves the playback and resolution outcomes", () => {
    expect(player).toContain('resolve("WATCHED")');
    expect(player).toContain('resolve("SKIPPED")');
    expect(player).toContain('resolve("PLAYBACK_ERROR")');
    expect(player).toContain('if (!manual)');
    expect(player).toContain('fetch("/api/brand-film"');
    expect(player).toContain("videoRef.current?.play()");
    expect(player).toContain("videoRef.current?.pause()");
    expect(player).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
  });

  it("preserves the production media contract", () => {
    expect(player).toContain("playsInline");
    expect(player).toContain('preload="metadata"');
    expect(player).toContain('poster="/media/brand/metrix-brand-film-poster.png"');
    expect(player).toContain('src="/media/brand/metrix-brand-film.mp4"');
    expect(player).not.toMatch(/\scontrols(?:=|\s|>)/);
    expect(player).not.toMatch(/\sautoPlay(?:=|\s|>)/);
  });

  it("keeps every approved visible action and the recovery copy", () => {
    for (const copy of ["Filmi Başlat", "Duraklat", "Devam Et", "Şimdi Başla"]) {
      expect(player).toContain(copy);
    }
    expect(player).toContain("Film başlatılamadı. Doğrudan Metrix’e devam edebilirsiniz.");
  });

  it("uses the approved geometry without legacy auth-era branding", () => {
    expect(styles).toContain("width:min(1090px,calc(100vw - 64px))");
    expect(styles).toContain("border-radius:28px");
    expect(styles).toContain("aspect-ratio:16/9");
    expect(styles).toContain("min-height:82px");
    expect(styles).toContain("min-width:170px");
    expect(styles).toContain("min-width:145px");
    expect(styles).toContain("left:18px");
    expect(styles).toContain("width:calc(100% - 36px)");
    expect(styles).toContain("border-radius:22px");
    expect(styles).toContain("height:48px");
    expect(player).not.toContain("AI EXECUTIVE OS");
    expect(player).not.toContain("#34e6cf");
    expect(styles).not.toContain("#34e6cf");
  });
});
