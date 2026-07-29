import { beforeAll, describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { POSITIONS, TIERS } from '../types'
import { loadCards } from './loadCards'

describe('generated card pool', () => {
  let cards: Card[] = []

  beforeAll(async () => {
    cards = await loadCards()
  })

  it('is a large all-time pool', () => {
    expect(cards.length).toBeGreaterThan(10000)
    expect(new Set(cards.map((c) => c.pid)).size).toBeGreaterThan(1500)
  })

  it('every card id is unique', () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length)
  })

  it('every card is structurally valid', () => {
    for (const c of cards) {
      expect(c.season).toBeGreaterThanOrEqual(1980)
      expect(c.season).toBeLessThanOrEqual(2026)
      expect(POSITIONS).toContain(c.pos)
      expect(TIERS).toContain(c.tier)
      expect(c.ovr).toBeGreaterThanOrEqual(55)
      expect(c.ovr).toBeLessThanOrEqual(99)
      expect(c.teams.length).toBeGreaterThan(0)
      for (const key of ['sc', 'sh', 'pm', 'rb', 'df', 'rm'] as const) {
        expect(c.attrs[key]).toBeGreaterThanOrEqual(25)
        expect(c.attrs[key]).toBeLessThanOrEqual(99)
      }
    }
  })

  it('every tier has enough cards for spin variety', () => {
    const byTier = new Map<string, number>()
    for (const c of cards) byTier.set(c.tier, (byTier.get(c.tier) ?? 0) + 1)
    for (const tier of TIERS) {
      expect(byTier.get(tier) ?? 0).toBeGreaterThan(300)
    }
  })

  it('every position has GOAT/SUPERSTAR representation', () => {
    for (const pos of POSITIONS) {
      const elite = cards.filter((c) => c.pos === pos && (c.tier === 'GOAT' || c.tier === 'SUPERSTAR'))
      expect(elite.length).toBeGreaterThan(30)
    }
  })

  it('iconic seasons rate as GOAT tier', () => {
    for (const id of ['jordami01-1991', 'jamesle01-2013', 'curryst01-2016', 'jokicni01-2024']) {
      const card = cards.find((c) => c.id === id)
      expect(card, id).toBeDefined()
      expect(card!.tier, id).toBe('GOAT')
    }
  })

  it('most cards have a real headshot id', () => {
    const withPhoto = cards.filter((c) => c.photo !== null).length
    expect(withPhoto / cards.length).toBeGreaterThan(0.9)
  })
})
