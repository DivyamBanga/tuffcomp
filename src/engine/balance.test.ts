import { describe, expect, it } from 'vitest'
import { computeBalance, needScores } from './balance'
import { makePlayer, makeTeam } from './testFixtures'

function balancedTeam() {
  return makeTeam({
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
}

// Same attacking talent, but everything behind the front three is weak -
// stacked toward attack with nothing covering defense or aerial duels.
function lopsidedAttackersTeam() {
  const weakBack = { defending: 30, physical: 35, passing: 40 }
  return makeTeam({
    gk: makePlayer({ positions: ['GK'], attributes: { defending: 40, physical: 40 } }),
    cb1: makePlayer({ positions: ['DEF'], attributes: weakBack }),
    cb2: makePlayer({ positions: ['DEF'], attributes: weakBack }),
    lb: makePlayer({ positions: ['DEF'], attributes: { ...weakBack, pace: 80 } }),
    rb: makePlayer({ positions: ['DEF'], attributes: { ...weakBack, pace: 80 } }),
    cdm: makePlayer({ positions: ['MID'], attributes: weakBack }),
    cm1: makePlayer({ positions: ['MID'], attributes: { ...weakBack, dribbling: 80 } }),
    cm2: makePlayer({ positions: ['MID'], attributes: { ...weakBack, dribbling: 80 } }),
    lw: makePlayer({ positions: ['FWD'], attributes: { pace: 90, dribbling: 88, shooting: 85 } }),
    rw: makePlayer({ positions: ['FWD'], attributes: { pace: 90, dribbling: 88, shooting: 85 } }),
    st: makePlayer({ positions: ['FWD'], attributes: { shooting: 92, pace: 88, physical: 40 } }),
  })
}

describe('computeBalance', () => {
  it('is 0 for an empty team', () => {
    expect(computeBalance([])).toBe(0)
  })

  it('scores a balanced XI higher than a lopsided all-attack team with the same attacking talent', () => {
    expect(computeBalance(balancedTeam())).toBeGreaterThan(computeBalance(lopsidedAttackersTeam()))
  })

  it('triggers the creativity gap penalty when there is no real playmaker', () => {
    const withPlaymaker = balancedTeam()
    const withoutPlaymaker = makeTeam({
      ...Object.fromEntries(balancedTeam().map(({ slot, player }) => [slot.id, player])),
      cdm: makePlayer({ positions: ['MID'], attributes: { passing: 30, defending: 78 } }),
      cm1: makePlayer({ positions: ['MID'], attributes: { passing: 30, dribbling: 78 } }),
      cm2: makePlayer({ positions: ['MID'], attributes: { passing: 30, dribbling: 76 } }),
    })

    const creativityWith = needScores(withPlaymaker).find((n) => n.name === 'creativity')!.score
    const creativityWithout = needScores(withoutPlaymaker).find((n) => n.name === 'creativity')!.score

    expect(creativityWithout).toBeLessThan(45)
    expect(creativityWith).toBeGreaterThanOrEqual(45)
    expect(computeBalance(withoutPlaymaker)).toBeLessThan(computeBalance(withPlaymaker))
  })

  it('needScores returns one entry per need, each 0 to 100', () => {
    const scores = needScores(balancedTeam())
    expect(scores.length).toBeGreaterThan(0)
    for (const { score } of scores) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })
})
