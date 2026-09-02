// Shared, domain-general "does this turn explicitly ask to see the result"
// signal — Workspace-intent contract: a successful mutation is
// background-safe by default (see METRIX_WORKSPACE_CANONICAL_OPERATION_HANDOFF.md).
// It must not auto-open a Workspace just because it succeeded; it opens only
// when the SAME turn's utterance explicitly asks to see/open the result.
//
// Deliberately excludes bare "aç"/"açalım" — several domains' own create
// vocabulary already uses "aç" as a CREATE synonym ("müşteri aç" = create a
// customer), so treating it as a reveal trigger too would misfire on
// ordinary create/action phrasing. Only unambiguous reveal phrases count.
// Manual boundary check (word-start via (?:^|\s), word-end via a lookahead
// for whitespace/punctuation/end-of-string) instead of \b — JS's \b is
// ASCII-\w-only even with the u flag, so it silently fails to find a
// boundary right after a Turkish letter like ç when followed by
// punctuation (e.g. "kartını aç." — \b never fires between ç and .).
const REVEAL_INTENT = /(?:^|\s)(göster|goster|kartını aç|kartini ac|detayına bak|detayina bak|kontrol edelim|ekranda göster|ekranda goster)(?=[\s.,!?]|$)/iu;

export function hasExplicitRevealIntent(utterance: string): boolean {
  return REVEAL_INTENT.test(utterance);
}

// Bare, standalone follow-up ("Aç.", "Göster.") with no entity named — used
// to resolve against a recently successful operation's own remembered
// entity, never as a free-form navigation request on its own.
const BARE_REVEAL_FOLLOW_UP = /^(aç|ac|açalım|acalim|göster|goster|kontrol edelim|detayına bak(?:alım)?|detayina bak(?:alim)?)[.!?]*$/iu;

export function isBareRevealFollowUp(utterance: string): boolean {
  return BARE_REVEAL_FOLLOW_UP.test(utterance.trim());
}
