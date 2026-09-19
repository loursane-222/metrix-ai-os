// Pure decision logic for the notification toast's sound. Kept free of
// React/DOM so the once-only rules are deterministic and unit-testable.
//
// Rules:
//  - The first successful fetch after the page mounts is only a baseline:
//    whatever is already unread (a refresh, a reopened tab) is remembered
//    silently, never announced.
//  - After the baseline, a notification id makes a sound at most once per
//    page session; a poll that returns ids already known (re-render, the
//    same notification on the next poll) is silent.
//  - One sound per fetch, however many new notifications it brought.

export type SoundState = {
  baselineDone: boolean;
  known: ReadonlySet<string>;
};

export const INITIAL_SOUND_STATE: SoundState = {
  baselineDone: false,
  known: new Set()
};

export function decideSound(
  state: SoundState,
  incomingIds: readonly string[]
): { play: boolean; state: SoundState } {
  const known = new Set(state.known);
  const fresh = incomingIds.filter(id => !known.has(id));

  for (const id of incomingIds) known.add(id);

  return {
    play: state.baselineDone && fresh.length > 0,
    state: { baselineDone: true, known }
  };
}
