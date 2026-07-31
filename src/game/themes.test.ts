import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import type { Card } from '../types'
import {
  CURATED_LISTS,
  normalizeName,
  pickDraftTheme,
  resolveTypedPick,
  suggestNames,
  themeById,
  themeCanCarryDraft,
} from './themes'

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

describe('theme selection (one theme carries the whole draft)', () => {
  it('deep themes carry a draft; thin lists drop out for bigger leagues', () => {
    const era90s = themeById('era-90s')
    expect(themeCanCarryDraft(era90s, pool, 4, 8)).toBe(true)
    expect(themeCanCarryDraft(era90s, pool, 8, 8)).toBe(true)
    expect(themeCanCarryDraft(themeById('fran-LAL'), pool, 4, 8)).toBe(true)
    // 27 MVP winners can't fill 4 teams x 8 rounds with slack.
    expect(themeCanCarryDraft(themeById('list-mvp'), pool, 4, 8)).toBe(false)
    // Rim protectors can't cover guard slots for whole teams.
    expect(themeCanCarryDraft(themeById('stat-swats'), pool, 4, 8)).toBe(false)
  })

  it('picks a deterministic theme with enough depth to carry the draft', () => {
    const a = pickDraftTheme(pool, 4, 42, 8)
    expect(pickDraftTheme(pool, 4, 42, 8)).toBe(a)
    expect(themeCanCarryDraft(themeById(a), pool, 4, 8)).toBe(true)
    const picks = new Set(Array.from({ length: 12 }, (_, seed) => pickDraftTheme(pool, 4, seed, 8)))
    expect(picks.size).toBeGreaterThan(3) // seeds actually vary the theme
  })
})

describe('suggestNames', () => {
  it('helps spelling from the full pool, famous names first', () => {
    expect(suggestNames(pool, 'ante')[0].name).toBe('Giannis Antetokounmpo')
    expect(suggestNames(pool, 'steph')[0].name).toBe('Stephen Curry')
    expect(suggestNames(pool, 'jok')[0].name).toBe('Nikola Jokić')
    expect(suggestNames(pool, 'curry').map((s) => s.name)).toContain('Stephen Curry')
  })

  it('caps the list and ignores tiny queries', () => {
    expect(suggestNames(pool, 'jo').length).toBeLessThanOrEqual(6)
    expect(suggestNames(pool, 'j')).toEqual([])
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
