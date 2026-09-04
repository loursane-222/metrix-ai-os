// Pure, dependency-free (no Prisma, no fetch) — deliberately its own file
// so callers that only need "does this message ask about email" (e.g.
// google-evidence-need.ts's pre-LLM classifier) never have to import
// gmail.service.ts's Prisma-backed chain just to run a regex. gmail.service.ts
// re-exports this for its own existing callers, so nothing else changes.
export function isExplicitGmailRequest(message: string): boolean {
  const lower = message.toLocaleLowerCase("tr-TR");
  const mailTerm = /(e-?posta|email|e-mail|mail|gmail|gelen kutu|yazışma)/i.test(lower);
  const action = /(bul|ara|bak|kontrol|göster|oku|geldi|var mı|son|önemli)/i.test(lower);
  return mailTerm && action;
}
