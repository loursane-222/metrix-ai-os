/**
 * Stage 1 Production Reliability Closure. Races `promise` against a timer;
 * resolves to `fallback` if the timer wins. Never rejects — a slow or hung
 * promise degrades to the exact same fallback a `.catch` already produces
 * for a genuine rejection, just with an upper bound on how long "slow" is
 * allowed to mean. A plain `.catch` only rescues a REJECTION; it does
 * nothing for a promise that never settles at all (observed live: a chat
 * request stuck at `await classifyPromise` for ~300s because one upstream
 * DB read in that chain never resolved and had no bound of its own).
 *
 * The original promise is not cancelled (Prisma/fetch calls here have no
 * cancellation token to honor) — it is left to settle on its own; only
 * this race's own outcome is used by the caller.
 */
export function withBoundedFallback<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}
