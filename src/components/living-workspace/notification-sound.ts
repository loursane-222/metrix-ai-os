// A short two-note chime made with the browser's own Web Audio API — no
// audio asset and no framework. It can never throw or reject: a sound
// problem must not affect the toast or the notification itself.
//
// Chrome's autoplay policy: an AudioContext created before the page has had
// a user gesture starts "suspended", and its resume() promise stays PENDING
// (it neither resolves nor rejects) until a gesture arrives. So the context
// is primed inside a real gesture (primeNotificationSound, wired by the
// toast), and a notification never waits on a resume() that cannot finish —
// it stays silent instead of hanging and then chiming late, out of context.

type AudioContextLike = {
  state?: string;
  currentTime: number;
  destination: unknown;
  resume?: () => Promise<void>;
  createOscillator: () => {
    type: string;
    frequency: { setValueAtTime: (value: number, at: number) => void };
    connect: (node: unknown) => void;
    start: (at: number) => void;
    stop: (at: number) => void;
  };
  createGain: () => {
    gain: {
      setValueAtTime: (value: number, at: number) => void;
      exponentialRampToValueAtTime: (value: number, at: number) => void;
    };
    connect: (node: unknown) => void;
  };
};

// How long to wait for resume() before treating the context as blocked.
const RESUME_WAIT_MS = 300;

let sharedContext: AudioContextLike | null = null;
let blockedWarned = false;

function audioContext(): AudioContextLike | null {
  if (sharedContext) return sharedContext;

  const scope = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };

  const Constructor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Constructor) return null;

  sharedContext = new Constructor();
  return sharedContext;
}

function isRunning(context: AudioContextLike): boolean {
  return context.state === undefined || context.state === "running";
}

// resume() bounded by RESUME_WAIT_MS; never throws, never waits forever.
async function resumeBounded(context: AudioContextLike): Promise<void> {
  if (!context.resume) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      context.resume().catch(() => undefined),
      new Promise<void>(resolve => {
        timer = setTimeout(resolve, RESUME_WAIT_MS);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Call from a real user gesture (pointer/key). Creates or resumes the shared
// context while the browser still allows it. Idempotent and best-effort;
// resolves true once audio is usable.
export async function primeNotificationSound(): Promise<boolean> {
  try {
    const context = audioContext();
    if (!context) return false;

    if (!isRunning(context)) await resumeBounded(context);

    return isRunning(context);
  } catch {
    return false;
  }
}

const NOTES: ReadonlyArray<{ frequency: number; offset: number }> = [
  { frequency: 880, offset: 0 },
  { frequency: 1175, offset: 0.14 }
];

export async function playNotificationSound(): Promise<void> {
  try {
    const context = audioContext();
    if (!context) return;

    if (!isRunning(context)) await resumeBounded(context);

    // Still blocked by the autoplay policy (no user gesture on this page yet):
    // stay silent, say so once in the console, and never retry invisibly.
    if (!isRunning(context)) {
      if (!blockedWarned) {
        blockedWarned = true;
        console.warn(
          "[metrix] Notification sound is blocked by the browser until you interact with the page."
        );
      }
      return;
    }

    const start = context.currentTime;

    for (const note of NOTES) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + note.offset;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.34);
    }
  } catch {
    // Sound is best-effort by design.
  }
}
