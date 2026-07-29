// Deterministic seeded PRNG (mulberry32). The whole sim runs on this so a
// given seed always replays the exact same game - tests rely on it, and the
// online host can share results as plain data.
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Approximately normal via sum of uniforms (Irwin-Hall) - cheap and plenty
// for game-score noise.
export function randNormal(rng: Rng, mean: number, stdDev: number): number {
  let sum = 0
  for (let i = 0; i < 6; i++) sum += rng()
  return mean + ((sum - 3) / Math.sqrt(0.5)) * stdDev * 0.7071
}

export function randInt(rng: Rng, min: number, maxInclusive: number): number {
  return min + Math.floor(rng() * (maxInclusive - min + 1))
}

export function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)]
}

// Fisher-Yates, returns a new array.
export function shuffle<T>(rng: Rng, items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
