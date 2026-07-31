import { describe, expect, it } from 'vitest'
import { makeCard, makeRoster } from './testFixtures'
import { simGame, simProfile, simSeries } from './sim'

function strongRoster() {
  return makeRoster({
    PG: makeCard({ pos: 'PG', ovr: 96, usg: 26, attrs: { sc: 92, pm: 95, sh: 88, df: 80 } }),
    SG: makeCard({ pos: 'SG', ovr: 94, usg: 24, attrs: { sc: 93, sh: 92, df: 82 } }),
    SF: makeCard({ pos: 'SF', ovr: 93, usg: 21, attrs: { sc: 88, df: 90, sh: 80 } }),
    PF: makeCard({ pos: 'PF', ovr: 92, usg: 18, attrs: { rb: 90, df: 88, rm: 82, sc: 78 } }),
    C: makeCard({ pos: 'C', ovr: 95, usg: 17, attrs: { rb: 95, rm: 96, df: 90, sc: 80 } }),
  })
}

function weakRoster() {
  return makeRoster({
    PG: makeCard({ pos: 'PG', ovr: 66, usg: 19, attrs: { sc: 45, pm: 55, sh: 45, df: 45 } }),
    SG: makeCard({ pos: 'SG', ovr: 65, usg: 19, attrs: { sc: 48, sh: 50, df: 42 } }),
    SF: makeCard({ pos: 'SF', ovr: 64, usg: 18, attrs: { sc: 44, df: 48, sh: 40 } }),
    PF: makeCard({ pos: 'PF', ovr: 66, usg: 17, attrs: { rb: 55, df: 50, rm: 45, sc: 42 } }),
    C: makeCard({ pos: 'C', ovr: 65, usg: 16, attrs: { rb: 58, rm: 55, df: 48, sc: 40 } }),
  })
}

describe('simGame', () => {
  it('is deterministic: same seed, same result', () => {
    const a = simProfile('A', strongRoster())
    const b = simProfile('B', weakRoster())
    expect(simGame(a, b, 42)).toEqual(simGame(a, b, 42))
  })

  it('varies with the seed', () => {
    const a = simProfile('A', strongRoster())
    const b = simProfile('B', weakRoster())
    const scores = new Set(Array.from({ length: 10 }, (_, i) => simGame(a, b, i).home.score))
    expect(scores.size).toBeGreaterThan(3)
  })

  it('box scores sum exactly to the team score', () => {
    const a = simProfile('A', strongRoster())
    const b = simProfile('B', weakRoster())
    for (let seed = 0; seed < 20; seed++) {
      const game = simGame(a, b, seed)
      expect(game.home.box.reduce((s, l) => s + l.pts, 0)).toBe(game.home.score)
      expect(game.away.box.reduce((s, l) => s + l.pts, 0)).toBe(game.away.score)
    }
  })

  it('quarters sum to the final score and never ends tied', () => {
    const a = simProfile('A', strongRoster())
    const b = simProfile('B', weakRoster())
    for (let seed = 100; seed < 160; seed++) {
      const game = simGame(a, b, seed)
      expect(game.home.quarters.reduce((s, q) => s + q, 0)).toBe(game.home.score)
      expect(game.away.quarters.reduce((s, q) => s + q, 0)).toBe(game.away.score)
      expect(game.home.score).not.toBe(game.away.score)
      expect(game.home.quarters.length).toBe(4 + game.overtimes)
    }
  })

  it('produces NBA-plausible scores', () => {
    const a = simProfile('A', strongRoster())
    const b = simProfile('B', weakRoster())
    for (let seed = 0; seed < 50; seed++) {
      const game = simGame(a, b, seed)
      for (const score of [game.home.score, game.away.score]) {
        expect(score).toBeGreaterThan(70)
        expect(score).toBeLessThan(170)
      }
    }
  })

  it('a much stronger team wins the clear majority over many games', () => {
    const strong = simProfile('A', strongRoster())
    const weak = simProfile('B', weakRoster())
    let strongWins = 0
    const n = 300
    for (let seed = 0; seed < n; seed++) {
      // alternate home court so venue doesn't skew the sample
      const game = seed % 2 === 0 ? simGame(strong, weak, seed) : simGame(weak, strong, seed)
      if (game.winnerId === 'A') strongWins++
    }
    expect(strongWins / n).toBeGreaterThan(0.75)
  })

  it('names a star of the game with a stat line', () => {
    const game = simGame(simProfile('A', strongRoster()), simProfile('B', weakRoster()), 7)
    expect(game.star.name.length).toBeGreaterThan(0)
    expect(game.star.line).toMatch(/PTS/)
  })
})

describe('heater nights', () => {
  it('a superstar can pop for 45+, stays realistic, and means hold', () => {
    const star = makeCard({ id: 'the-star', pos: 'SG', ovr: 99, usg: 34, attrs: { sc: 99, sh: 95, df: 80 } })
    const starTeam = simProfile('A', makeRoster({ SG: star }))
    const opponent = simProfile('B', weakRoster())

    const points: number[] = []
    for (let seed = 0; seed < 400; seed++) {
      const game = seed % 2 === 0 ? simGame(starTeam, opponent, seed) : simGame(opponent, starTeam, seed)
      const side = game.home.teamId === 'A' ? game.home : game.away
      points.push(side.box.find((line) => line.cardId === 'the-star')!.pts)
    }

    const max = Math.max(...points)
    const mean = points.reduce((a, b) => a + b, 0) / points.length
    expect(max).toBeGreaterThanOrEqual(45) // takeover nights exist
    expect(max).toBeLessThanOrEqual(72) // but stay on this planet
    expect(mean).toBeGreaterThan(20)
    expect(mean).toBeLessThan(40)
    expect(points.filter((p) => p >= 45).length / points.length).toBeLessThan(0.12) // heaters are rare
  })
})

describe('simSeries', () => {
  it('ends the moment someone reaches 4 wins, max 7 games', () => {
    const a = simProfile('A', strongRoster())
    const b = simProfile('B', weakRoster())
    for (let seed = 0; seed < 30; seed++) {
      const series = simSeries(a, b, seed)
      const winnerWins = series.tally[series.winnerId]
      const loserWins = series.tally[series.loserId]
      expect(winnerWins).toBe(4)
      expect(loserWins).toBeLessThan(4)
      expect(series.games.length).toBe(winnerWins + loserWins)
      expect(series.games.length).toBeLessThanOrEqual(7)
    }
  })

  it('is deterministic under a fixed seed', () => {
    const a = simProfile('A', strongRoster())
    const b = simProfile('B', weakRoster())
    expect(simSeries(a, b, 11)).toEqual(simSeries(a, b, 11))
  })
})
