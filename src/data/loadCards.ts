import type { Card } from '../types'

// players.json is ~3.7MB (11k+ real player-seasons) - loaded lazily via
// dynamic import so it's a separate chunk from app code, cached after the
// first load.
let cached: Card[] | null = null

export async function loadCards(): Promise<Card[]> {
  if (cached) return cached
  const module = await import('./players.json')
  cached = module.default as unknown as Card[]
  return cached
}

export function loadFranchises(): Promise<Record<string, string>> {
  return import('./franchises.json').then((m) => m.default as Record<string, string>)
}
