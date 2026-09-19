import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INITIAL_SOUND_STATE,
  decideSound
} from "../../src/components/living-workspace/notification-delivery-state";

describe("sound decision — once per new eligible notification", () => {
  it("the first fetch is a silent baseline: a refresh never replays old unread notifications", () => {
    const first = decideSound(INITIAL_SOUND_STATE, ["old-1", "old-2"]);
    expect(first.play).toBe(false);
    expect(first.state.baselineDone).toBe(true);

    // A brand-new page load (fresh state) is again silent for the same unread set.
    expect(decideSound(INITIAL_SOUND_STATE, ["old-1", "old-2"]).play).toBe(false);
  });

  it("a genuinely new notification sounds exactly once — re-render and re-poll of it are silent", () => {
    let state = decideSound(INITIAL_SOUND_STATE, ["old-1"]).state;

    const arrival = decideSound(state, ["new-1", "old-1"]);
    expect(arrival.play).toBe(true);
    state = arrival.state;

    for (let poll = 0; poll < 5; poll += 1) {
      const again = decideSound(state, ["new-1", "old-1"]);
      expect(again.play).toBe(false);
      state = again.state;
    }
  });

  it("several new notifications in one fetch make one sound, not one each", () => {
    const state = decideSound(INITIAL_SOUND_STATE, []).state;
    const burst = decideSound(state, ["a", "b", "c"]);

    expect(burst.play).toBe(true);
    expect(decideSound(burst.state, ["a", "b", "c"]).play).toBe(false);
  });

  it("an empty feed (category disabled / muted) never sounds, and a read notification coming back is not new", () => {
    let state = decideSound(INITIAL_SOUND_STATE, []).state;
    expect(decideSound(state, []).play).toBe(false);

    state = decideSound(state, ["n1"]).state; // sounded once
    state = decideSound(state, []).state; // marked read → gone from the feed
    expect(decideSound(state, ["n1"]).play).toBe(false); // e.g. failed mark-read reappears
  });
});

describe("playNotificationSound — best-effort, never throws", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function freshModule() {
    vi.resetModules();
    return import("../../src/components/living-workspace/notification-sound");
  }

  function stubAudio(options: { state?: string; resume?: () => Promise<void>; throwOnCreate?: boolean } = {}) {
    const started: number[] = [];
    class FakeAudioContext {
      state = options.state ?? "running";
      currentTime = 0;
      destination = {};
      resume = options.resume;
      constructor() {
        if (options.throwOnCreate) throw new Error("audio unavailable");
      }
      createOscillator() {
        return {
          type: "",
          frequency: { setValueAtTime: () => {} },
          connect: () => {},
          start: (at: number) => started.push(at),
          stop: () => {}
        };
      }
      createGain() {
        return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {} };
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    return started;
  }

  it("plays a short two-note chime when the browser allows audio", async () => {
    const started = stubAudio();
    const { playNotificationSound } = await freshModule();

    await expect(playNotificationSound()).resolves.toBeUndefined();
    expect(started).toHaveLength(2);
  });

  it("stays silent, without an error, when autoplay is blocked (context stays suspended)", async () => {
    const started = stubAudio({ state: "suspended", resume: async () => {} });
    const { playNotificationSound } = await freshModule();

    await expect(playNotificationSound()).resolves.toBeUndefined();
    expect(started).toHaveLength(0);
  });

  it("swallows a rejected resume(), a throwing constructor and a missing AudioContext", async () => {
    stubAudio({ state: "suspended", resume: async () => { throw new DOMException("NotAllowedError"); } });
    await expect((await freshModule()).playNotificationSound()).resolves.toBeUndefined();

    vi.unstubAllGlobals();
    stubAudio({ throwOnCreate: true });
    await expect((await freshModule()).playNotificationSound()).resolves.toBeUndefined();

    vi.unstubAllGlobals();
    vi.stubGlobal("AudioContext", undefined);
    await expect((await freshModule()).playNotificationSound()).resolves.toBeUndefined();
  });
});

describe("toast wiring — sound never blocks or replaces the toast", () => {
  const toast = readFileSync("src/components/living-workspace/MetrixNotificationToast.tsx", "utf8");

  it("shows the toast first, decides sound with the once-only rule, and never awaits the audio", () => {
    const setItems = toast.indexOf("setItems(list)");
    const decide = toast.indexOf("decideSound(");
    const play = toast.indexOf("playNotificationSound()");

    expect(setItems).toBeGreaterThan(-1);
    expect(decide).toBeGreaterThan(setItems);
    expect(play).toBeGreaterThan(decide);
    expect(toast).toMatch(/if \(decision\.play\) void playNotificationSound\(\)/);
    expect(toast).not.toMatch(/await playNotificationSound/);
  });

  it("uses no audio asset or framework — the browser's own Web Audio only", () => {
    const sound = readFileSync("src/components/living-workspace/notification-sound.ts", "utf8");
    expect(sound).toContain("AudioContext");
    expect(sound).not.toMatch(/\.mp3|\.wav|\.ogg|new Audio\(|import .* from "(?!\.)/);
  });
});

describe("Settings UI — the user sees Turkish options, never internal enums", () => {
  const settings = readFileSync("src/components/metrix-conversation/SettingsMenu.tsx", "utf8");

  it("offers exactly the five canonical choices in the existing Settings menu", () => {
    for (const label of ["Kritik olaylar", "Finans", "Satış", "Görevler", "Hiç konuşmasın"]) {
      expect(settings).toContain(label);
    }
    expect(settings).toContain("<NotificationSettingsForm />");
    expect(settings).toContain("Bildirimler");
  });

  it("shows no internal category enum in any user-facing text", () => {
    const form = settings.slice(settings.indexOf("function NotificationSettingsForm"), settings.indexOf("function SettingsBellIcon"));
    const strings = form.match(/"[^"\n]{3,}"|>[^<>{}\n]{3,}</g) ?? [];
    for (const text of strings) {
      expect(text).not.toMatch(/\b(CRITICAL|FINANCE|SALES|TASKS|notifyMuteAll|muteAll)\b(?!:)/);
    }
  });

  it("loads and saves through the preferences API and renders the server's read-back value", () => {
    expect(settings).toContain('"/api/notifications/preferences"');
    expect(settings).toContain('method: "PUT"');
    expect(settings).toMatch(/setPreferences\(result\.preferences\)/);
    // No client-supplied identity in the request body.
    expect(settings).not.toMatch(/JSON\.stringify\(\{[^}]*(userId|organizationId)/);
  });

  it("individual categories are disabled while 'Hiç konuşmasın' is on", () => {
    expect(settings).toMatch(/disabled=\{saving \|\| preferences\.muteAll\}/);
  });
});

// A fake that follows Chrome's real autoplay policy, which the simple stub
// above does not: a context created before a user gesture starts "suspended"
// and its resume() promise stays PENDING (never resolves, never rejects)
// until a gesture. Physical failure: the toast showed but no sound played,
// because the old code awaited that resume() forever.
describe("Chrome autoplay policy — regression for 'toast shown, no sound'", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function stubChrome() {
    const chrome = {
      activated: false,
      pending: [] as Array<() => void>,
      contexts: 0,
      oscillatorsStarted: 0,
      peakGain: 0,
      activate() {
        chrome.activated = true;
        for (const release of chrome.pending.splice(0)) release();
      }
    };

    class ChromeAudioContext {
      state = chrome.activated ? "running" : "suspended";
      currentTime = 0;
      destination = {};
      constructor() {
        chrome.contexts += 1;
      }
      resume() {
        if (this.state === "running") return Promise.resolve();
        if (chrome.activated) {
          this.state = "running";
          return Promise.resolve();
        }
        return new Promise<void>(resolve => {
          chrome.pending.push(() => {
            this.state = "running";
            resolve();
          });
        });
      }
      createOscillator() {
        return {
          type: "",
          frequency: { setValueAtTime: () => {} },
          connect: () => {},
          start: () => {
            chrome.oscillatorsStarted += 1;
          },
          stop: () => {}
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => {},
            exponentialRampToValueAtTime: (value: number) => {
              chrome.peakGain = Math.max(chrome.peakGain, value);
            }
          },
          connect: () => {}
        };
      }
    }

    vi.stubGlobal("AudioContext", ChromeAudioContext);
    return chrome;
  }

  async function freshModule() {
    vi.resetModules();
    return import("../../src/components/living-workspace/notification-sound");
  }

  it("a notification arriving before any user gesture does not hang, stays silent, and never chimes late", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chrome = stubChrome();
    const { playNotificationSound } = await freshModule();

    const arrival = playNotificationSound();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(arrival).resolves.toBeUndefined(); // the old code never settled here
    expect(chrome.oscillatorsStarted).toBe(0);

    // The first gesture after the blocked arrival must not release a stale chime.
    chrome.activate();
    await vi.advanceTimersByTimeAsync(1000);
    expect(chrome.oscillatorsStarted).toBe(0);

    // The blocked arrival was reported once; the next notification, now that a
    // gesture unlocked audio, plays instead of warning again.
    const second = playNotificationSound();
    await vi.advanceTimersByTimeAsync(1000);
    await second;
    expect(warn).toHaveBeenCalledTimes(1);
    expect(chrome.oscillatorsStarted).toBe(2);
  });

  it("a blocked play warns exactly once across repeated attempts", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubChrome();
    const { playNotificationSound } = await freshModule();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const blocked = playNotificationSound();
      await vi.advanceTimersByTimeAsync(1000);
      await blocked;
    }

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a user gesture primes audio, and the next eligible notification then sounds once", async () => {
    const chrome = stubChrome();
    const { primeNotificationSound, playNotificationSound } = await freshModule();

    chrome.activate(); // the user types / clicks in METRIX
    await expect(primeNotificationSound()).resolves.toBe(true);
    expect(chrome.oscillatorsStarted).toBe(0); // priming itself is silent

    await playNotificationSound();
    expect(chrome.oscillatorsStarted).toBe(2); // one two-note chime
    expect(chrome.contexts).toBe(1); // primed context reused, not recreated
  });

  it("priming without a gesture, or a context already stuck suspended, fails quietly and recovers on the next gesture", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const chrome = stubChrome();
    const { primeNotificationSound, playNotificationSound } = await freshModule();

    const early = primeNotificationSound();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(early).resolves.toBe(false); // no throw, UI unaffected

    const blocked = playNotificationSound();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(blocked).resolves.toBeUndefined();
    expect(chrome.oscillatorsStarted).toBe(0);

    chrome.activate();
    await expect(primeNotificationSound()).resolves.toBe(true);
    await playNotificationSound();
    expect(chrome.oscillatorsStarted).toBe(2);
    expect(chrome.contexts).toBe(1);
  });

  it("priming never throws when Web Audio is missing or the constructor fails", async () => {
    vi.stubGlobal("AudioContext", undefined);
    await expect((await freshModule()).primeNotificationSound()).resolves.toBe(false);

    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("audio unavailable");
        }
      }
    );
    await expect((await freshModule()).primeNotificationSound()).resolves.toBe(false);
  });

  it("the chime is loud enough to be heard (peak gain was 0.12 ≈ −18 dBFS, too faint)", async () => {
    const chrome = stubChrome();
    chrome.activate();
    const { playNotificationSound } = await freshModule();

    await playNotificationSound();
    expect(chrome.peakGain).toBeGreaterThanOrEqual(0.25);
    expect(chrome.peakGain).toBeLessThanOrEqual(0.5); // still a notification, not an alarm
  });

  it("once-only, preference and refresh rules hold with real audio: new → one chime; re-render, re-poll, old unread, disabled/muted (empty feed) → none", async () => {
    const chrome = stubChrome();
    chrome.activate();
    const { primeNotificationSound, playNotificationSound } = await freshModule();
    await primeNotificationSound();

    let state = INITIAL_SOUND_STATE;
    const deliver = async (ids: string[]) => {
      const decision = decideSound(state, ids);
      state = decision.state;
      if (decision.play) await playNotificationSound();
    };

    await deliver(["old-1"]); // page refresh: old unread is a silent baseline
    expect(chrome.oscillatorsStarted).toBe(0);

    await deliver(["mehmet", "old-1"]); // genuinely new eligible notification
    expect(chrome.oscillatorsStarted).toBe(2);

    for (let poll = 0; poll < 3; poll += 1) await deliver(["mehmet", "old-1"]); // re-render / re-poll
    expect(chrome.oscillatorsStarted).toBe(2);

    await deliver([]); // category disabled / muteAll: nothing eligible reaches the feed
    expect(chrome.oscillatorsStarted).toBe(2);
  });

  it("the toast primes audio from real gestures only, stops listening once audio is usable, and cleans up", () => {
    const toast = readFileSync("src/components/living-workspace/MetrixNotificationToast.tsx", "utf8");

    expect(toast).toContain("primeNotificationSound");
    expect(toast).toMatch(/\["pointerdown", "pointerup", "keydown"\]/);
    expect(toast).toMatch(/document\.addEventListener\(gesture, unlock, true\)/);
    expect(toast).toMatch(/if \(ready && !disposed\) remove\(\)/);
    expect(toast).toMatch(/return \(\) => \{\s*disposed = true;\s*remove\(\);/);
    // The sound decision and the toast are untouched by the priming.
    expect(toast).toMatch(/if \(decision\.play\) void playNotificationSound\(\)/);
  });
});
