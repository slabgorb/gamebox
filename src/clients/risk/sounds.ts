// src/clients/risk/sounds.ts
// Lightweight SFX player for the Risk client. Mirrors the words-plugin
// pattern: one Audio per source, cloned per play() so overlapping
// triggers don't cut each other off.
//
// Each event maps to an ARRAY of clip URLs (variations); play() picks
// one at random per call so repeated actions don't get monotonous. SFX
// selected from GSFXUB Vol. I + II to fit the antique campaign-map
// theme:
//   click     — territory select (UI click)
//   place     — deploy token (short dry plink — fired per regiment)
//   cannon    — attack launched (cannon fire / pirate blunderbuss)
//   capture   — territory taken (heavy rocks hit)
//   repulsed  — attack failed (UI wrong-answer tone)
//   your-turn — turn flips to you (long chime)
//   victory   — game over win (musical fanfare)

export type SfxName =
  | "click"
  | "place"
  | "cannon"
  | "capture"
  | "repulsed"
  | "your-turn"
  | "victory";

// Variation pool per event. play() picks one uniformly at random.
// Adding a new clip is as simple as dropping the .mp3 into
// plugins/risk/client/sounds/ and appending the URL here.
const SRC: Record<SfxName, readonly string[]> = {
  click: [
    "sounds/click-1.mp3",
    "sounds/click-2.mp3",
    "sounds/click-3.mp3",
  ],
  place: [
    "sounds/place-1.mp3",
    "sounds/place-2.mp3",
    "sounds/place-3.mp3",
  ],
  cannon: [
    "sounds/cannon-1.mp3",
    "sounds/cannon-2.mp3",
    "sounds/cannon-3.mp3",
    "sounds/cannon-4.mp3",
    "sounds/cannon-5.mp3",
  ],
  capture: [
    "sounds/capture-1.mp3",
    "sounds/capture-2.mp3",
    "sounds/capture-3.mp3",
  ],
  repulsed: [
    "sounds/repulsed-1.mp3",
    "sounds/repulsed-2.mp3",
    "sounds/repulsed-3.mp3",
  ],
  "your-turn": ["sounds/your-turn.mp3"],
  victory: ["sounds/victory.mp3"],
};

// Per-event playback volume — tuned by ear against the words SFX.
const VOLUME: Record<SfxName, number> = {
  click: 0.5,
  place: 0.35,
  cannon: 0.8,
  capture: 0.85,
  repulsed: 0.7,
  "your-turn": 0.65,
  victory: 0.9,
};

const MUTE_KEY = "risk.muted";
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* SSR/test */ }

// Cache keyed by URL (not by event name) — variations share the same
// pool, and an event can list the same URL twice to bias the random
// pick without storing two copies of the buffer.
const cache = new Map<string, HTMLAudioElement>();

function load(url: string): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  let a = cache.get(url);
  if (!a) {
    a = new Audio(url);
    a.preload = "auto";
    cache.set(url, a);
  }
  return a;
}

function pickVariant(name: SfxName): string | null {
  const pool = SRC[name];
  if (!pool || pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function play(name: SfxName): void {
  if (muted) return;
  const url = pickVariant(name);
  if (!url) return;
  const base = load(url);
  if (!base) return;
  const clip = base.cloneNode() as HTMLAudioElement;
  clip.volume = VOLUME[name] ?? 1;
  try {
    // HTMLMediaElement.play() returns a Promise in real browsers but
    // returns undefined under JSDOM (where the test runs). Guard both
    // shapes so the test environment doesn't throw on `.catch`.
    const result = clip.play() as Promise<void> | undefined;
    if (result && typeof result.catch === "function") {
      result.catch(() => { /* autoplay blocked until first interaction */ });
    }
  } catch { /* media not implemented */ }
}

export function isMuted(): boolean { return muted; }

export function toggleMuted(): boolean {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* */ }
  return muted;
}

// Warm the audio cache on first user interaction so later plays don't
// race against the autoplay policy. Loads every variation up front —
// the bundle is small (~1.5MB total) and we want the first cannon shot
// to be instant, not the second.
let primed = false;
export function primeAudio(): void {
  if (primed) return;
  primed = true;
  for (const pool of Object.values(SRC)) {
    for (const url of pool) load(url);
  }
}
