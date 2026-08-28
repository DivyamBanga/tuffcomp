import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import type { Card } from '../types'
import {
  CURATED_LISTS,
  eligibleThemes,
  normalizeName,
  pickDraftTheme,
  resolveTypedPick,
  suggestNames,
  THEMES,
  themeById,
  themeCanCarryDraft,
  themeNeedsPositionless,
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

describe('theme facts', () => {
  const card = (id: string) => {
    const c = pool.find((x) => x.id === id)
    expect(c, id).toBeDefined()
    return c!
  }
  const passes = (themeId: string, cardId: string) => themeById(themeId).test(card(cardId))

  it('franchise lineages fold old cities into the modern brand', () => {
    expect(passes('fran-LAL', 'mikange01-1951')).toBe(true) // Minneapolis Lakers
    expect(passes('fran-GSW', 'chambwi01-1962')).toBe(true) // Philadelphia Warriors
    expect(passes('fran-SAC', 'roberos01-1962')).toBe(true) // Cincinnati Royals
    expect(passes('fran-DET', 'jordami01-1991')).toBe(false)
    expect(passes('fran-OKC', 'paytoga01-1996')).toBe(false) // SEA stays SEA
  })

  it('measurable themes read real height, weight, age', () => {
    expect(passes('bio-sevenfeet', 'wembavi01-2026')).toBe(true)
    expect(passes('bio-sevenfeet', 'curryst01-2016')).toBe(false)
    expect(passes('bio-shortkings', 'iversal01-2001')).toBe(true) // 6'0 AI
    expect(passes('bio-shortkings', 'jamesle01-2013')).toBe(false)
    expect(passes('bio-heavy', 'onealsh01-2000')).toBe(true)
    expect(passes('bio-under25', 'jordami01-1985')).toBe(true) // rookie MJ
    expect(passes('bio-under25', 'jordami01-1996')).toBe(false)
    expect(passes('bio-oldman', 'jamesle01-2026')).toBe(true) // 41-year-old LeBron
    expect(passes('bio-oldman', 'jamesle01-2013')).toBe(false)
  })

  it('career themes know rings, loyalty, rookie years', () => {
    expect(passes('career-ringless', 'barklch01-1993')).toBe(true) // Chuck never won
    expect(passes('career-ringless', 'jordami01-1996')).toBe(false)
    expect(passes('career-champs', 'curryst01-2016')).toBe(true)
    expect(passes('career-loyal', 'bryanko01-2006')).toBe(true) // Laker for life
    expect(passes('career-loyal', 'jamesle01-2013')).toBe(false)
    expect(passes('career-rookies', 'wembavi01-2024')).toBe(true)
    expect(passes('career-rookies', 'wembavi01-2026')).toBe(false)
  })

  it('award themes know the hardware', () => {
    expect(passes('award-no1', 'jamesle01-2013')).toBe(true)
    expect(passes('award-no1', 'jordami01-1991')).toBe(false) // MJ went third
    expect(passes('award-allstar', 'jordami01-1996')).toBe(true)
    expect(passes('award-neverstar', 'jamesle01-2013')).toBe(false)
    expect(passes('list-mvp', 'russebi01-1962')).toBe(true) // data-driven MVPs reach the 60s
  })
})

describe('theme selection (one theme carries the whole draft)', () => {
  it('deep themes carry a draft; thin lists drop out for bigger leagues', () => {
    const era90s = themeById('era-90s')
    expect(themeCanCarryDraft(era90s, pool, 4, 8)).toBe(true)
    expect(themeCanCarryDraft(era90s, pool, 8, 8)).toBe(true)
    expect(themeCanCarryDraft(themeById('fran-LAL'), pool, 4, 8)).toBe(true)
    // 37 MVP winners can't fill 4 teams x 8 rounds with slack.
    expect(themeCanCarryDraft(themeById('list-mvp'), pool, 4, 8)).toBe(false)
    expect(themeCanCarryDraft(themeById('list-mvp'), pool, 1, 8)).toBe(true)
  })

  it('position-locked themes play positionless instead of dropping out', () => {
    // No 7-footer runs point; no floor general protects the rim.
    expect(themeCanCarryDraft(themeById('bio-sevenfeet'), pool, 4, 8)).toBe(true)
    expect(themeNeedsPositionless(themeById('bio-sevenfeet'), pool, 1)).toBe(true)
    expect(themeNeedsPositionless(themeById('stat-swats'), pool, 1)).toBe(true)
    // Ordinary themes keep real positions.
    expect(themeNeedsPositionless(themeById('era-90s'), pool, 8)).toBe(false)
    expect(themeNeedsPositionless(themeById('fran-LAL'), pool, 4)).toBe(false)
  })

  it('picks a deterministic theme with enough depth to carry the draft', () => {
    const a = pickDraftTheme(pool, 4, 42, 8)
    expect(pickDraftTheme(pool, 4, 42, 8)).toBe(a)
    expect(themeCanCarryDraft(themeById(a), pool, 4, 8)).toBe(true)
    const picks = new Set(Array.from({ length: 12 }, (_, seed) => pickDraftTheme(pool, 4, seed, 8)))
    expect(picks.size).toBeGreaterThan(3) // seeds actually vary the theme
  })

  it('honors a chosen theme when it can carry, falls back when it cannot', () => {
    expect(pickDraftTheme(pool, 1, 7, 8, 'list-bald')).toBe('list-bald')
    expect(pickDraftTheme(pool, 4, 7, 8, 'era-90s')).toBe('era-90s')
    // Bald squad is far too thin for 8 teams - random takes over.
    const fallback = pickDraftTheme(pool, 8, 7, 8, 'list-bald')
    expect(fallback).not.toBe('list-bald')
    expect(themeCanCarryDraft(themeById(fallback), pool, 8, 8)).toBe(true)
    expect(pickDraftTheme(pool, 4, 7, 8, 'nonsense-id')).not.toBe('nonsense-id')
  })

  it('eligibleThemes: everything offered is playable, and the fun ones make the solo cut', () => {
    const solo = eligibleThemes(pool, 1, 8)
    for (const theme of solo) {
      expect(themeCanCarryDraft(theme, pool, 1, 8), theme.id).toBe(true)
    }
    const ids = solo.map((t) => t.id)
    for (const mustHave of [
      'fran-LAL', 'era-60s', 'era-pioneers', 'stat-buckets', 'stat-swats',
      'bio-under25', 'bio-oldman', 'bio-sevenfeet', 'bio-shortkings', 'bio-heavy',
      'career-loyal', 'career-journeymen', 'career-ringless', 'career-champs', 'career-rookies',
      'list-mvp', 'award-dpoy', 'award-allstar', 'award-neverstar', 'award-no1', 'award-undrafted',
      'list-intl', 'list-white', 'list-bald', 'list-lefty', 'list-canada', 'list-blood',
    ]) {
      expect(ids, mustHave).toContain(mustHave)
    }
    // Bigger leagues offer fewer themes than solo.
    expect(eligibleThemes(pool, 8, 8).length).toBeLessThan(solo.length)
    expect(THEMES.length).toBeGreaterThan(50)
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
