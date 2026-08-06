import fs from "node:fs";
import path from "node:path";

const TurkishCopyFiles = [
  "src/app/api/ai/chat/route.ts",
  "src/lib/executive-awareness/executive-awareness-summary.service.ts",
  "src/lib/executive-daily-briefing-v2/executive-daily-briefing-v2-summary.service.ts",
  "src/lib/executive-focus/executive-focus-engine.service.ts",
  "src/lib/executive-decision-engine/executive-decision-engine.service.ts",
  "src/lib/executive-brain/executive-decision-engine.service.ts",
];
const allExecutiveFiles = fs.readdirSync("src/lib", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("executive-"))
  .flatMap((entry) => collectSourceFiles(path.join("src/lib", entry.name)));
const files = [...new Set([...allExecutiveFiles, "src/app/api/ai/chat/route.ts"])]
  .filter((file) => fs.existsSync(file));
const forbiddenPlaceholders = /\b(TODO|lorem|Executive rhythm|Signal trend)\b/u;
const forbiddenTurkish = [
  /\b(degerlendir|degerlendirme|yonetim|Musteri|Gecikmis|Bazi|henuz|Bugun|Sirket|netles|kaynaklari|sinirli|Izlenecek)\b/u,
];
const violations = [];
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    // Machine identifiers and diagnostics are not user copy.
    if (forbiddenPlaceholders.test(line)) violations.push(`${file}:${index + 1}`);
  });
}
for (const file of TurkishCopyFiles) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/source|errorCode|UNKNOWN|terms:|field:|key:/u.test(line)) return;
    if (forbiddenTurkish.some((pattern) => pattern.test(line))) violations.push(`${file}:${index + 1}`);
  });
}
if (violations.length > 0) {
  console.error("User-facing text quality guard failed:\n" + violations.join("\n"));
  process.exit(1);
}
console.log(`User-facing text quality guard passed (${files.length} files).`);

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(ts|tsx)$/u.test(entry.name) ? [fullPath] : [];
  });
}
