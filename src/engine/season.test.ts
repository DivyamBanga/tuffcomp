import { describe, expect, it } from 'vitest'
import { makeCard, makeRoster } from './testFixtures'
import { simProfile, type TeamSimProfile } from './sim'
import { computeMvp, initSeason, makeSchedule, playoffTeamCount, simNextGame, simPlayoffs, sortStandings } from './season'

function rosterWithOvr(ovr: number) {
  return makeRoster({
    PG: makeCard({ pos: 'PG', ovr, usg: 24, attrs: { sc: ovr, pm: ovr, sh: ovr - 10, df: ovr - 10 } }),
    SG: makeCard({ pos: 'SG', ovr, usg: 22, attrs: { sc: ovr, sh: ovr, df: ovr - 12 } }),
    SF: makeCard({ pos: 'SF', ovr, usg: 20, attrs: { sc: ovr - 5, df: ovr, sh: ovr - 12 } }),
    PF: makeCard({ pos: 'PF', ovr, usg: 18, attrs: { rb: ovr, df: ovr - 5, rm: ovr - 10 } }),
    C: makeCard({ pos: 'C', ovr, usg: 16, attrs: { rb: ovr, rm: ovr, df: ovr - 5, sc: ovr - 15 } }),
  })
}

function profiles(): Map<string, TeamSimProfile> {
  const strengths: Record<string, number> = { T1: 92, T2: 85, T3: 78, T4: 70 }
  return new Map(
    Object.entries(strengths).map(([id, ovr]) => {
      const clamped = Math.min(95, ovr)
      return [id, simProfile(id, rosterWithOvr(clamped))]
    }),
  )
}

describe('makeSchedule', () => {
  it('double round robin: every pair meets twice with home/away swapped', () => {
    const schedule = makeSchedule(['T1', 'T2', 'T3', 'T4'], 5)
    expect(schedule.length).toBe(12) // 4 teams: C(4,2)=6 pairs x 2
    const key = (h: string, a: string) => `${h}@${a}`
    const seen = new Set(schedule.map((g) => key(g.homeId, g.awayId)))
    expect(seen.size).toBe(12)
    expect(seen.has('T1@T2')).toBe(true)
    expect(seen.has('T2@T1')).toBe(true)
  })

  it('is deterministically shuffled by seed', () => {
    expect(makeSchedule(['T1', 'T2', 'T3'], 9)).toEqual(makeSchedule(['T1', 'T2', 'T3'], 9))
  })
})

describe('season flow', () => {
  it('sims every scheduled game, keeps standings consistent, then returns null', () => {
    const map = profiles()
    let season = initSeason([...map.keys()], 3)
    let steps = 0
    for (;;) {
      const next = simNextGame(season, map, 1000)
      if (!next) break
      season = next.season
      steps++
    }
    expect(steps).toBe(season.schedule.length)
    const totalWins = season.standings.reduce((s, r) => s + r.wins, 0)
    const totalLosses = season.standings.reduce((s, r) => s + r.losses, 0)
    expect(totalWins).toBe(season.schedule.length)
    expect(totalLosses).toBe(season.schedule.length)
    for (const row of season.standings) {
      expect(row.wins + row.losses).toBe(6) // each of 4 teams plays 6
    }
  })

  it('much better teams finish higher over a full season', () => {
    const map = profiles()
    let season = initSeason([...map.keys()], 3)
    for (;;) {
      const next = simNextGame(season, map, 77)
      if (!next) break
      season = next.season
    }
    const table = sortStandings(season.standings)
    // T1 (92 ovr) should not finish below T4 (70 ovr)
    const rank = (id: string) => table.findIndex((r) => r.teamId === id)
    expect(rank('T1')).toBeLessThan(rank('T4'))
  })
})

describe('playoffs', () => {
  it('bracket sizes follow league size', () => {
    expect(playoffTeamCount(8)).toBe(8)
    expect(playoffTeamCount(6)).toBe(4)
    expect(playoffTeamCount(4)).toBe(4)
    expect(playoffTeamCount(2)).toBe(2)
  })

  it('produces a champion and a Finals round', () => {
    const map = profiles()
    const result = simPlayoffs(['T1', 'T2', 'T3', 'T4'], map, 55)
    expect([...map.keys()]).toContain(result.championId)
    expect(result.rounds.at(-1)!.name).toBe('THE FINALS')
    expect(result.rounds.at(-1)!.series.length).toBe(1)
    expect(result.rounds[0].series.length).toBe(2)
  })

  it('is deterministic under a fixed seed', () => {
    const map = profiles()
    expect(simPlayoffs(['T1', 'T2', 'T3', 'T4'], map, 55)).toEqual(simPlayoffs(['T1', 'T2', 'T3', 'T4'], map, 55))
  })
})

describe('computeMvp', () => {
  it('crowns a most productive player with a stat line', () => {
    const map = profiles()
    let season = initSeason([...map.keys()], 3)
    for (let i = 0; i < 6; i++) {
      const next = simNextGame(season, map, 500)
      if (!next) break
      season = next.season
    }
    const mvp = computeMvp(season.played)
    expect(mvp).not.toBeNull()
    expect(mvp!.statLine).toMatch(/PPG/)
  })
})
