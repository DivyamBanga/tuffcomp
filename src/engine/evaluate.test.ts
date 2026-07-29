import { describe, expect, it } from 'vitest'
import { evaluateTeam, POWER_WEIGHTS, realTeammatePairs, usageOverload } from './evaluate'
import { makeCard, makeRoster } from './testFixtures'

function balancedStarters(ovr = 88) {
  return makeRoster({
    PG: makeCard({ pos: 'PG', ovr, usg: 24, attrs: { pm: 92, sh: 75, sc: 80, df: 70 } }),
    SG: makeCard({ pos: 'SG', ovr, usg: 22, attrs: { sh: 90, sc: 85, df: 75 } }),
    SF: makeCard({ pos: 'SF', ovr, usg: 20, attrs: { sc: 82, df: 85, sh: 72 } }),
    PF: makeCard({ pos: 'PF', ovr, usg: 18, attrs: { rb: 88, df: 82, rm: 75 } }),
    C: makeCard({ pos: 'C', ovr, usg: 16, attrs: { rb: 92, rm: 95, df: 85, sc: 70 } }),
  })
}

describe('POWER_WEIGHTS', () => {
  it('sums to 1', () => {
    expect(Object.values(POWER_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
  })
})

describe('evaluateTeam', () => {
  it('returns zeros for an empty roster', () => {
    const result = evaluateTeam({ PG: null, SG: null, SF: null, PF: null, C: null, B1: null, B2: null, B3: null })
    expect(result.power).toBe(0)
    expect(result.summary).toBe('')
  })

  it('higher overall talent means more power', () => {
    expect(evaluateTeam(balancedStarters(92)).power).toBeGreaterThan(evaluateTeam(balancedStarters(70)).power)
  })

  it('penalizes a ball-hog lineup: five 30-usage stars lose to a balanced one', () => {
    const ballHogs = makeRoster({
      PG: makeCard({ pos: 'PG', ovr: 88, usg: 33, attrs: { sc: 90, pm: 70 } }),
      SG: makeCard({ pos: 'SG', ovr: 88, usg: 33, attrs: { sc: 92, sh: 80 } }),
      SF: makeCard({ pos: 'SF', ovr: 88, usg: 32, attrs: { sc: 91, sh: 74 } }),
      PF: makeCard({ pos: 'PF', ovr: 88, usg: 31, attrs: { sc: 89, rb: 70 } }),
      C: makeCard({ pos: 'C', ovr: 88, usg: 30, attrs: { sc: 88, rb: 80, rm: 70 } }),
    })
    expect(usageOverload(ballHogs)).toBeGreaterThan(0)
    expect(evaluateTeam(ballHogs).power).toBeLessThan(evaluateTeam(balancedStarters(88)).power)
  })

  it('penalizes out-of-position lineups via fit', () => {
    const natural = balancedStarters()
    const stretched = makeRoster({
      PG: makeCard({ pos: 'SG', ovr: 88, usg: 24, attrs: { pm: 92, sh: 75, sc: 80, df: 70 } }),
      SG: makeCard({ pos: 'SF', ovr: 88, usg: 22, attrs: { sh: 90, sc: 85, df: 75 } }),
      SF: makeCard({ pos: 'SG', ovr: 88, usg: 20, attrs: { sc: 82, df: 85, sh: 72 } }),
      PF: makeCard({ pos: 'C', ovr: 88, usg: 18, attrs: { rb: 88, df: 82, rm: 75 } }),
      C: makeCard({ pos: 'PF', ovr: 88, usg: 16, attrs: { rb: 92, rm: 95, df: 85, sc: 70 } }),
    })
    expect(evaluateTeam(stretched).fit).toBeLessThan(evaluateTeam(natural).fit)
    expect(evaluateTeam(stretched).power).toBeLessThan(evaluateTeam(natural).power)
  })

  it('rewards real-life teammates and era cohesion via chemistry', () => {
    const jordan = makeCard({ name: 'Michael Jordan', pos: 'SG', season: 1996, teams: ['CHI'] })
    const pippen = makeCard({ name: 'Scottie Pippen', pos: 'SF', season: 1996, teams: ['CHI'] })
    const together = makeRoster({ SG: jordan, SF: pippen })
    const apart = makeRoster({
      SG: makeCard({ pos: 'SG', season: 1985, teams: ['BOS'] }),
      SF: makeCard({ pos: 'SF', season: 2015, teams: ['GSW'] }),
    })
    expect(realTeammatePairs([jordan, pippen]).length).toBe(1)
    expect(evaluateTeam(together).chemistry).toBeGreaterThan(evaluateTeam(apart).chemistry)
    expect(evaluateTeam(together).duos[0]).toContain('Jordan')
  })

  it('same franchise decades apart is not real chemistry', () => {
    const jordan96 = makeCard({ pos: 'SG', season: 1996, teams: ['CHI'] })
    const lavine21 = makeCard({ pos: 'SF', season: 2021, teams: ['CHI'] })
    expect(realTeammatePairs([jordan96, lavine21]).length).toBe(0)
  })

  it('flags a missing need in balance and the summary', () => {
    const noRim = makeRoster({
      PF: makeCard({ pos: 'PF', ovr: 88, attrs: { rm: 26, rb: 40, df: 45 } }),
      C: makeCard({ pos: 'C', ovr: 88, attrs: { rm: 28, rb: 42, df: 45 } }),
    })
    const withRim = balancedStarters()
    expect(evaluateTeam(noRim).balance).toBeLessThan(evaluateTeam(withRim).balance)
  })

  it('produces a non-empty summary naming the top weapon', () => {
    const result = evaluateTeam(balancedStarters())
    expect(result.summary.length).toBeGreaterThan(10)
    expect(result.summary).toContain('Best weapon')
  })
})
