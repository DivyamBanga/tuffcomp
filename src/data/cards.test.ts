import { beforeAll, describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { POSITIONS, TIERS } from '../types'
import { loadCards } from './loadCards'
import themeData from './themeData.json'

describe('generated card pool', () => {
  let cards: Card[] = []

  beforeAll(async () => {
    cards = await loadCards()
  })

  it('is the full all-time pool, 1947 through today', () => {
    expect(cards.length).toBeGreaterThan(13000)
    expect(new Set(cards.map((c) => c.pid)).size).toBeGreaterThan(2000)
    expect(Math.min(...cards.map((c) => c.season))).toBe(1947)
    expect(Math.max(...cards.map((c) => c.season))).toBe(2026)
  })

  it('every card id is unique', () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length)
  })

  it('every card is structurally valid', () => {
    const bad: string[] = []
    for (const c of cards) {
      const attrsOk = (['sc', 'sh', 'pm', 'rb', 'df', 'rm'] as const).every(
        (key) => c.attrs[key] >= 25 && c.attrs[key] <= 99,
      )
      if (
        c.season < 1947 ||
        c.season > 2026 ||
        !POSITIONS.includes(c.pos) ||
        !TIERS.includes(c.tier) ||
        c.ovr < 68 ||
        c.ovr > 99 ||
        c.teams.length === 0 ||
        !attrsOk
      ) {
        bad.push(c.id)
      }
    }
    expect(bad).toEqual([])
  })

  it('ratings follow the 2K shape: 99 is a tiny club, 90+ is rare', () => {
    const ninetyNines = cards.filter((c) => c.ovr === 99)
    expect(ninetyNines.length).toBeGreaterThanOrEqual(5)
    expect(ninetyNines.length).toBeLessThanOrEqual(15)
    const modern = cards.filter((c) => c.season === 2026)
    const elite = modern.filter((c) => c.ovr >= 90)
    expect(elite.length / modern.length).toBeLessThan(0.1)
  })

  it('every tier has enough cards for draft variety', () => {
    const byTier = new Map<string, number>()
    for (const c of cards) byTier.set(c.tier, (byTier.get(c.tier) ?? 0) + 1)
    for (const tier of TIERS) {
      expect(byTier.get(tier) ?? 0).toBeGreaterThan(100)
    }
  })

  it('every position has GOAT/SUPERSTAR representation', () => {
    for (const pos of POSITIONS) {
      const elite = cards.filter((c) => c.pos === pos && (c.tier === 'GOAT' || c.tier === 'SUPERSTAR'))
      expect(elite.length).toBeGreaterThan(30)
    }
  })

  it('iconic seasons across every era rate as GOAT tier', () => {
    const icons = [
      'jordami01-1991',
      'jamesle01-2013',
      'curryst01-2016',
      'jokicni01-2024',
      'chambwi01-1962',
      'abdulka01-1972',
      'birdla01-1986',
      'johnsma02-1987',
    ]
    for (const id of icons) {
      const card = cards.find((c) => c.id === id)
      expect(card, id).toBeDefined()
      expect(card!.tier, id).toBe('GOAT')
    }
  })

  it('old-era legends qualified despite era stat gaps', () => {
    for (const [pid, minOvr] of [
      ['mikange01', 93], // George Mikan
      ['russebi01', 93], // Bill Russell
      ['westje01', 93], // Jerry West
      ['roberos01', 93], // Oscar Robertson
      ['pettibo01', 93], // Bob Pettit
    ] as const) {
      const best = Math.max(...cards.filter((c) => c.pid === pid).map((c) => c.ovr), 0)
      expect(best, pid).toBeGreaterThanOrEqual(minOvr)
    }
  })

  it('most cards have a real headshot id', () => {
    const withPhoto = cards.filter((c) => c.photo !== null).length
    expect(withPhoto / cards.length).toBeGreaterThan(0.9)
  })

  describe('theme data', () => {
    it('has real coverage in every list', () => {
      expect(themeData.mvp.length).toBeGreaterThan(30)
      expect(themeData.dpoy.length).toBeGreaterThan(20)
      expect(themeData.smoy.length).toBeGreaterThan(25)
      expect(themeData.roy.length).toBeGreaterThan(60)
      expect(themeData.everAllStar.length).toBeGreaterThan(400)
      expect(themeData.allStarSeasons.length).toBeGreaterThan(1500)
      expect(themeData.firstOverall.length).toBeGreaterThan(60)
      expect(themeData.undrafted.length).toBeGreaterThan(150)
      expect(themeData.rings.length).toBeGreaterThan(400)
      expect(themeData.oneTeam.length).toBeGreaterThan(100)
      expect(themeData.journeymen.length).toBeGreaterThan(300)
    })

    it('every listed pid exists in the card pool', () => {
      const pids = new Set(cards.map((c) => c.pid))
      const lists = [
        themeData.mvp,
        themeData.dpoy,
        themeData.smoy,
        themeData.roy,
        themeData.everAllStar,
        themeData.firstOverall,
        themeData.undrafted,
        themeData.rings,
        themeData.oneTeam,
        themeData.journeymen,
      ]
      const missing = lists.flatMap((list) => list.filter((pid) => !pids.has(pid)))
      expect(missing).toEqual([])
    })

    it('heights and weights cover every player in the pool', () => {
      const pids = new Set(cards.map((c) => c.pid))
      let covered = 0
      for (const pid of pids) {
        if ((themeData.heights as Record<string, number>)[pid] > 0) covered++
      }
      expect(covered / pids.size).toBeGreaterThan(0.98)
    })

    it('known facts hold', () => {
      expect(themeData.mvp).toContain('jokicni01') // Jokic won MVP
      expect(themeData.dpoy).toContain('goberru01') // Gobert won DPOY
      expect(themeData.firstOverall).toContain('jamesle01') // LeBron went #1
      expect(themeData.undrafted).toContain('vanvlfr01') // VanVleet went undrafted
      expect(themeData.rings).toContain('brunsja01') // Brunson: 2026 champ
      expect(themeData.rings).toContain('curryst01')
      expect(themeData.oneTeam).toContain('bryanko01') // Kobe: Laker for life
      expect(themeData.journeymen).toContain('crawfja01') // Jamal Crawford wandered
    })
  })
})
