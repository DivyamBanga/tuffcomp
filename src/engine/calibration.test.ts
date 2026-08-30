import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import { draftFillerTeam } from '../game/draft'
import type { Card } from '../types'
import { BENCH_SLOTS, canPlaySlot, emptyRoster, STARTER_SLOTS, type Roster } from './lineup'
import { evaluateTeam } from './evaluate'
import { simGame, simProfile, simSeries } from './sim'

// The win-probability contract (user-confirmed 2026-08-29): the best team
// actually wins. Legends beat a good team ~9 nights in 10, roll an average
// team ~97%+, and a GREAT chase draft goes 82-0 roughly 1 run in 10.
// These tests pin the whole sim + slate calibration to those targets.

let pool: Card[] = []

beforeAll(async () => {
  pool = await loadCards()
})

// Best peak season per person, cached across tests.
let peaksCache: Card[] | null = null
function peaks(): Card[] {
  if (peaksCache) return peaksCache
  const byPid = new Map<string, Card>()
  for (const c of pool) {
    const cur = byPid.get(c.pid)
    if (!cur || c.ovr > cur.ovr) byPid.set(c.pid, c)
  }
  peaksCache = [...byPid.values()]
  return peaksCache
}

// A legal roster whose players sit as close to targetOvr as possible.
function rosterAt(targetOvr: number, exclude = new Set<string>()): Roster {
  const roster = emptyRoster()
  const used = new Set<string>()
  const candidates = [...peaks()]
    .filter((c) => !exclude.has(c.pid))
    .sort((a, b) => Math.abs(a.ovr - targetOvr) - Math.abs(b.ovr - targetOvr))
  for (const slot of STARTER_SLOTS) {
    const card = candidates.find((c) => !used.has(c.pid) && c.pos === slot)!
    roster[slot] = card
    used.add(card.pid)
  }
  for (const slot of BENCH_SLOTS) {
    const card = candidates.find((c) => !used.has(c.pid) && canPlaySlot(c, slot))!
    roster[slot] = card
    used.add(card.pid)
  }
  return roster
}

// The best five in history at their natural positions, best bench behind.
function goatRoster(): Roster {
  const roster = emptyRoster()
  const used = new Set<string>()
  const best = [...peaks()].sort((a, b) => b.ovr - a.ovr)
  for (const slot of STARTER_SLOTS) {
    const card = best.find((c) => !used.has(c.pid) && c.pos === slot)!
    roster[slot] = card
    used.add(card.pid)
  }
  for (const slot of BENCH_SLOTS) {
    const card = best.find((c) => !used.has(c.pid))!
    roster[slot] = card
    used.add(card.pid)
  }
  return roster
}

function winRate(a: Roster, b: Roster, games = 600): { pct: number; margin: number } {
  const pa = simProfile('A', a)
  const pb = simProfile('B', b)
  let wins = 0
  let marginSum = 0
  for (let g = 0; g < games; g++) {
    const r = g % 2 === 0 ? simGame(pa, pb, 1000 + g) : simGame(pb, pa, 1000 + g)
    const aScore = g % 2 === 0 ? r.home.score : r.away.score
    const bScore = g % 2 === 0 ? r.away.score : r.home.score
    if (aScore > bScore) wins++
    marginSum += aScore - bScore
  }
  return { pct: wins / games, margin: marginSum / games }
}

// Mirrors the chase slate in match.ts - keep in sync.
const CHASE_SLATE_TARGETS = [86, 85, 84, 83, 83, 82, 82, 81, 81, 80, 80, 79, 78, 77]

function chaseWinRate(mine: Roster): number {
  const pg = simProfile('me', mine)
  const draftedAll = new Set(Object.values(mine).map((c) => c!.pid))
  const opps = CHASE_SLATE_TARGETS.map((target, i) => {
    const f = draftFillerTeam(draftedAll, { pool }, 4242 + i, target)
    for (const pid of f.draftedPids) draftedAll.add(pid)
    return simProfile(`f${i}`, f.roster)
  })
  let wins = 0
  let total = 0
  for (let rep = 0; rep < 20; rep++) {
    for (let g = 0; g < 82; g++) {
      const opp = opps[g % opps.length]
      const r = g % 2 === 0 ? simGame(pg, opp, rep * 100000 + g) : simGame(opp, pg, rep * 100000 + g)
      const my = g % 2 === 0 ? r.home.score : r.away.score
      const their = g % 2 === 0 ? r.away.score : r.home.score
      if (my > their) wins++
      total++
    }
  }
  return wins / total
}

describe('the best team wins: single games', () => {
  it('all-time legends beat a team of 90s ~9 nights in 10, by double digits', () => {
    const goats = goatRoster()
    const exclude = new Set(Object.values(goats).map((c) => c!.pid))
    const { pct, margin } = winRate(goats, rosterAt(90, exclude))
    expect(pct).toBeGreaterThan(0.87)
    expect(pct).toBeLessThan(0.97)
    expect(margin).toBeGreaterThan(10)
  })

  it('all-time legends roll an average-82 team ~97%+', () => {
    const goats = goatRoster()
    const exclude = new Set(Object.values(goats).map((c) => c!.pid))
    const { pct } = winRate(goats, rosterAt(82, exclude))
    expect(pct).toBeGreaterThan(0.96)
  })

  it('a 90-average team clearly handles an 82-average team', () => {
    const strong = rosterAt(90)
    const exclude = new Set(Object.values(strong).map((c) => c!.pid))
    const { pct } = winRate(strong, rosterAt(82, exclude))
    expect(pct).toBeGreaterThan(0.7)
    expect(pct).toBeLessThan(0.93)
  })

  it('the power meter agrees: legends outrank the 90s team by a wide gap', () => {
    const goats = goatRoster()
    const exclude = new Set(Object.values(goats).map((c) => c!.pid))
    const strong = rosterAt(90, exclude)
    expect(evaluateTeam(goats).power - evaluateTeam(strong).power).toBeGreaterThanOrEqual(8)
  })
})

describe('the best team wins: series', () => {
  it('a clearly better team survives best-of-7 nearly always', () => {
    const goats = goatRoster()
    const exclude = new Set(Object.values(goats).map((c) => c!.pid))
    const pa = simProfile('A', goats)
    const pb = simProfile('B', rosterAt(90, exclude))
    let aWins = 0
    for (let s = 0; s < 150; s++) {
      if (simSeries(pa, pb, 5000 + s * 97).winnerId === 'A') aWins++
    }
    expect(aWins / 150).toBeGreaterThan(0.97)
  })
})

describe('the 82-0 chase is calibrated', () => {
  it('a GREAT draft (avg ~96) wins ~97-98.5% per game: the ring lands ~1 run in 10', () => {
    const pct = chaseWinRate(rosterAt(96))
    expect(pct).toBeGreaterThan(0.965)
    expect(pct).toBeLessThan(0.99)
  })

  it('the literal best-possible draft is better still', () => {
    const pct = chaseWinRate(goatRoster())
    expect(pct).toBeGreaterThan(0.98)
  })

  it('a merely good draft (avg ~90) posts a strong record but never rings', () => {
    const pct = chaseWinRate(rosterAt(90))
    expect(pct).toBeGreaterThan(0.6)
    expect(pct).toBeLessThan(0.96)
  })
})
