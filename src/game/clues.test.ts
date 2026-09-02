import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import type { Card } from '../types'
import { candidateClues, CLUES_MAX, CLUES_TO_OPEN, crowdValue, fits, MIN_FITS, MIN_SPREAD, pickClues } from './clues'

let pool: Card[] = []
let people: Card[] = []

beforeAll(async () => {
  pool = await loadCards()
  // Best season per person over the whole pool: the RANDOM-theme universe.
  const byPid = new Map<string, Card>()
  for (const c of pool) {
    const cur = byPid.get(c.pid)
    if (!cur || c.ovr > cur.ovr) byPid.set(c.pid, c)
  }
  people = [...byPid.values()]
})

const card = (id: string) => pool.find((c) => c.id === id)!

describe('candidateClues', () => {
  it('reads real facts off a legend', () => {
    const texts = candidateClues(card('jordami01-1996')).map((c) => c.text)
    expect(texts).toContain('HAS WON AN MVP')
    expect(texts).toContain('WORE RED THAT SEASON')
    expect(texts).toContain(`BETWEEN 6'4" AND 6'6"`)
    expect(texts).toContain('PLAYED AS A GUARD')
    expect(texts).toContain('30+ POINTS A GAME')
    expect(texts).toContain('HAS A CHAMPIONSHIP RING')
    expect(texts).toContain('A TOP-FIVE PICK')
    expect(texts).toContain('FAMOUSLY BALD')
    expect(texts).toContain('THIS SEASON WAS IN THE 1990s')
  })

  it('every clue is true for its own card', () => {
    const sample = people.filter((_, i) => i % 13 === 0)
    for (const c of sample) {
      for (const clue of candidateClues(c)) {
        expect(clue.test(c), `${c.name} ${c.season}: ${clue.text}`).toBe(true)
      }
    }
  })

  it('knows the old days had no three-point line', () => {
    const texts = candidateClues(card('chambwi01-1962')).map((c) => c.text)
    expect(texts).toContain('PLAYED BEFORE THE THREE-POINT LINE')
    expect(texts).toContain('OVER SEVEN FEET TALL')
  })
})

describe('pickClues: the anti-giveaway rule', () => {
  it('every shown prefix still fits a star and a scrub', () => {
    const sample = people.filter((_, i) => i % 17 === 0)
    expect(sample.length).toBeGreaterThan(100)
    for (const c of sample) {
      const clues = pickClues(c, people, 7)
      expect(clues.length, c.name).toBeGreaterThanOrEqual(CLUES_TO_OPEN)
      expect(clues.length).toBeLessThanOrEqual(CLUES_MAX)
      for (let k = CLUES_TO_OPEN; k <= clues.length; k++) {
        const matching = fits(people, clues.slice(0, k))
        expect(matching.length, `${c.name} after ${k} clues`).toBeGreaterThanOrEqual(MIN_FITS)
        const ovrs = matching.map((m) => m.ovr)
        expect(Math.max(...ovrs) - Math.min(...ovrs), `${c.name} spread after ${k}`).toBeGreaterThanOrEqual(MIN_SPREAD)
        // And the real answer is always still in the running.
        expect(matching.some((m) => m.id === c.id)).toBe(true)
      }
    }
  })

  it('opens with two different clue families', () => {
    const sample = people.filter((_, i) => i % 29 === 0)
    for (const c of sample) {
      const clues = pickClues(c, people, 3)
      expect(clues[0].family, c.name).not.toBe(clues[1].family)
    }
  })

  it('is deterministic per seed and varies across seeds', () => {
    const mj = card('jordami01-1996')
    expect(pickClues(mj, people, 1).map((c) => c.text)).toEqual(pickClues(mj, people, 1).map((c) => c.text))
    const variants = new Set(Array.from({ length: 6 }, (_, s) => pickClues(mj, people, s).map((c) => c.id).join('|')))
    expect(variants.size).toBeGreaterThan(1)
  })
})

describe('crowdValue', () => {
  it('prices the opening pair like a reasonable guesser', () => {
    const mj = card('jordami01-1996')
    const clues = pickClues(mj, people, 5).slice(0, CLUES_TO_OPEN)
    const value = crowdValue(people, clues, (c) => Math.max(1, Math.round((c.ovr - 68) / 1.2)))
    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(28)
  })
})
