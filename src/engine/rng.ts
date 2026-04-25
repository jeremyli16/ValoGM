// Seeded deterministic RNG — mulberry32 algorithm
export type SeededRng = () => number;

export function createRng(seed: number): SeededRng {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: SeededRng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randFloat(rng: SeededRng, min: number, max: number): number {
  return rng() * (max - min) + min;
}

export function randChoice<T>(rng: SeededRng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function weightedChoice<T>(rng: SeededRng, items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function shuffle<T>(rng: SeededRng, arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Clamp a value between min and max
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
