import { describe, expect, it } from 'vitest'
import { summarize } from './explain'
import { makePlayer, makeTeam } from './testFixtures'

describe('summarize', () => {
  it('is empty for an empty team', () => {
    expect(summarize([], 0)).toBe('')
  })

  it('names a stretched player out of natural position', () => {
    const team = makeTeam({
      cb1: makePlayer({ name: 'Misplaced Mike', positions: ['MID'] }),
    })
    expect(summarize(team, 75)).toContain('Misplaced Mike')
  })

  it('names the weakest need when a team has an obvious gap', () => {
    const team = makeTeam({
      cdm: makePlayer({ positions: ['MID'], attributes: { passing: 20 } }),
      cm1: makePlayer({ positions: ['MID'], attributes: { passing: 20 } }),
      cm2: makePlayer({ positions: ['MID'], attributes: { passing: 20 } }),
    })
    expect(summarize(team, 75)).toContain('creativity')
  })

  it('praises a fully natural, well-balanced team without naming a gap', () => {
    const team = makeTeam({
      gk: makePlayer({ positions: ['GK'], attributes: { defending: 85, physical: 80 } }),
      cb1: makePlayer({ positions: ['DEF'], attributes: { defending: 85, physical: 82 } }),
      cb2: makePlayer({ positions: ['DEF'], attributes: { defending: 83, physical: 80 } }),
      lb: makePlayer({ positions: ['DEF'], attributes: { pace: 78, defending: 75 } }),
      rb: makePlayer({ positions: ['DEF'], attributes: { pace: 78, defending: 75 } }),
      cdm: makePlayer({ positions: ['MID'], attributes: { defending: 78, passing: 75 } }),
      cm1: makePlayer({ positions: ['MID'], attributes: { passing: 82, dribbling: 78 } }),
      cm2: makePlayer({ positions: ['MID'], attributes: { passing: 80, dribbling: 76 } }),
      lw: makePlayer({ positions: ['FWD'], attributes: { pace: 85, dribbling: 82, shooting: 75 } }),
      rw: makePlayer({ positions: ['FWD'], attributes: { pace: 85, dribbling: 82, shooting: 75 } }),
      st: makePlayer({ positions: ['FWD'], attributes: { shooting: 88, pace: 82, physical: 78 } }),
    })
    const summary = summarize(team, 80)
    expect(summary).toContain('Every player is comfortably in position')
    expect(summary).toContain('Well balanced')
  })
})
