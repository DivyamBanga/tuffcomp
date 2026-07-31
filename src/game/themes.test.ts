import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import type { Card } from '../types'
import { CURATED_LISTS, THEMES, normalizeName, pickThemeRounds, resolveTypedPick, themeHasDepth } from './themes'

let pool: Card[] = []

beforeAll(async () => {
  pool = await loadCards()
})

describe('curated lists', () => {
  it('every hand-curated name matches at least one real card', () => {
    const names = new Set(pool.map((c) => normalizeName(c.name)))
    for (const [listId, list] of Object.entries(CURATED_LISTS)) {
      const missing = list.filter((n) => !names.has(normalizeName(n)))
      expect(missing, `${listId} has unmatched names`).toEqual([])
    }
  })
})

describe('theme registry', () => {
  it('every theme has draftable depth for leagues of 4 and 8', () => {
    for (const theme of THEMES) {
      expect(themeHasDepth(theme, pool, 4), theme.id).toBe(true)
      expect(themeHasDepth(theme, pool, 8), theme.id).toBe(true)
    }
  })

  it('picks 8 unique theme rounds deterministically', () => {
    const a = pickThemeRounds(pool, 4, 42, 8)
    const b = pickThemeRounds(pool, 4, 42, 8)
    expect(a).toEqual(b)
    expect(a.length).toBe(8)
    expect(new Set(a).size).toBe(8)
    const c = pickThemeRounds(pool, 4, 43, 8)
    expect(c).not.toEqual(a)
  })
})

describe('resolveTypedPick', () => {
  const resolve = (q: string) => resolveTypedPick(pool, q)?.name

  it('handles exact, prefix, single-token, and fuzzy queries', () => {
    expect(resolve('stephen curry')).toBe('Stephen Curry')
    expect(resolve('steph curry')).toBe('Stephen Curry')
    expect(resolve('lebron')).toBe('LeBron James')
    expect(resolve('giannis')).toBe('Giannis Antetokounmpo')
    expect(resolve('labron james')).toBe('LeBron James')
    expect(resolve('shaq')).toContain("Shaquille O'Neal")
  })

  it('strips diacritics both ways', () => {
    expect(resolve('jokic')).toBe('Nikola Jokić')
    expect(resolve('luka doncic')).toBe('Luka Dončić')
  })

  it('famous name wins a bare surname', () => {
    expect(resolve('jordan')).toBe('Michael Jordan')
    expect(resolve('curry')).toBe('Stephen Curry')
  })

  it('rejects nonsense', () => {
    expect(resolveTypedPick(pool, 'xqzvw plork')).toBeNull()
    expect(resolveTypedPick(pool, 'a')).toBeNull()
  })
})
