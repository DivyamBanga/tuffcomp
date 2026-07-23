import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY, bestRating, loadHistory, saveHistory, type SavedResult } from './persistence'

// Vitest's default node environment has no localStorage global - stub a
// minimal in-memory implementation rather than pulling in jsdom just for
// this thin persistence layer.
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

function makeResult(overrides: Partial<SavedResult> = {}): SavedResult {
  return {
    id: overrides.id ?? 'result-1',
    playedAt: overrides.playedAt ?? new Date().toISOString(),
    rating: overrides.rating ?? 70,
    quality: overrides.quality ?? 70,
    fit: overrides.fit ?? 70,
    chemistry: overrides.chemistry ?? 70,
    balance: overrides.balance ?? 70,
    summary: overrides.summary ?? 'Test summary.',
    isNewBest: overrides.isNewBest ?? false,
    players: overrides.players ?? [],
  }
}

describe('persistence', () => {
  beforeEach(() => {
    // @ts-expect-error - test-only global stub
    globalThis.localStorage = new MemoryStorage()
  })

  afterEach(() => {
    // @ts-expect-error - test-only global stub
    delete globalThis.localStorage
  })

  it('returns an empty history when nothing has been saved', () => {
    expect(loadHistory()).toEqual([])
  })

  it('round-trips a saved history', () => {
    const history = [makeResult({ id: 'a', rating: 80 }), makeResult({ id: 'b', rating: 65 })]
    saveHistory(history)
    expect(loadHistory()).toEqual(history)
  })

  it('caps history at 50 entries, keeping the front of the array', () => {
    const history = Array.from({ length: 60 }, (_, i) => makeResult({ id: `r${i}`, rating: i }))
    saveHistory(history)
    const loaded = loadHistory()
    expect(loaded.length).toBe(50)
    expect(loaded[0].id).toBe('r0')
  })

  it('does not throw when localStorage is unavailable', () => {
    // @ts-expect-error - test-only global stub
    delete globalThis.localStorage
    expect(() => saveHistory([makeResult()])).not.toThrow()
    expect(loadHistory()).toEqual([])
  })

  it('recovers from corrupted JSON instead of throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json')
    expect(loadHistory()).toEqual([])
  })
})

describe('bestRating', () => {
  it('is null for empty history', () => {
    expect(bestRating([])).toBeNull()
  })

  it('is the highest rating in history', () => {
    const history = [makeResult({ rating: 60 }), makeResult({ rating: 90 }), makeResult({ rating: 75 })]
    expect(bestRating(history)).toBe(90)
  })
})
