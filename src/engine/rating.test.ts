import { describe, expect, it } from 'vitest'
import { RATING_WEIGHTS, rateTeam } from './rating'
import { makePlayer, makeTeam } from './testFixtures'

function greatBalancedTeam() {
  return makeTeam({
    gk: makePlayer({ positions: ['GK'], nation: 'France', overall: 88, attributes: { defending: 88, physical: 82 } }),
    cb1: makePlayer({ positions: ['DEF'], nation: 'France', overall: 87, attributes: { defending: 88, physical: 85 } }),
    cb2: makePlayer({ positions: ['DEF'], nation: 'France', overall: 85, attributes: { defending: 85, physical: 83 } }),
    lb: makePlayer({ positions: ['DEF'], nation: 'France', overall: 84, attributes: { pace: 84, defending: 80 } }),
    rb: makePlayer({ positions: ['DEF'], nation: 'France', overall: 84, attributes: { pace: 84, defending: 80 } }),
    cdm: makePlayer({ positions: ['MID'], nation: 'France', overall: 86, attributes: { defending: 82, passing: 82 } }),
    cm1: makePlayer({ positions: ['MID'], nation: 'France', overall: 87, attributes: { passing: 88, dribbling: 84 } }),
    cm2: makePlayer({ positions: ['MID'], nation: 'France', overall: 85, attributes: { passing: 85, dribbling: 82 } }),
    lw: makePlayer({ positions: ['FWD'], nation: 'France', overall: 88, attributes: { pace: 90, dribbling: 88, shooting: 80 } }),
    rw: makePlayer({ positions: ['FWD'], nation: 'France', overall: 88, attributes: { pace: 90, dribbling: 88, shooting: 80 } }),
    st: makePlayer({ positions: ['FWD'], nation: 'France', overall: 91, attributes: { shooting: 92, pace: 86, physical: 82 } }),
  })
}

function weakScatteredTeam() {
  return makeTeam(
    Object.fromEntries(
      greatBalancedTeam().map(({ slot }, i) => [
        slot.id,
        makePlayer({ positions: [slot.position], nation: `Nation${i}`, overall: 55, attributes: { pace: 50, shooting: 50, passing: 50, dribbling: 50, defending: 50, physical: 50 } }),
      ]),
    ),
  )
}

describe('RATING_WEIGHTS', () => {
  it('sums to 1', () => {
    const total = Object.values(RATING_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 5)
  })
})

describe('rateTeam', () => {
  it('returns 0 across the board for an empty team', () => {
    const result = rateTeam([])
    expect(result.rating).toBe(0)
    expect(result.quality).toBe(0)
    expect(result.fit).toBe(0)
    expect(result.chemistry).toBe(0)
    expect(result.balance).toBe(0)
    expect(result.summary).toBe('')
  })

  it('is exactly the weighted blend of its four components', () => {
    const team = greatBalancedTeam()
    const result = rateTeam(team)
    const expected = Math.round(
      result.quality * RATING_WEIGHTS.quality +
        result.fit * RATING_WEIGHTS.fit +
        result.chemistry * RATING_WEIGHTS.chemistry +
        result.balance * RATING_WEIGHTS.balance,
    )
    expect(result.rating).toBe(expected)
  })

  it('scores a great, balanced, chemistry-rich team far above a weak, scattered one', () => {
    const great = rateTeam(greatBalancedTeam())
    const weak = rateTeam(weakScatteredTeam())
    expect(great.rating).toBeGreaterThan(weak.rating)
  })

  it('lowers the rating when a striker is placed at center back instead of a natural center back', () => {
    const withNaturalCb = rateTeam(greatBalancedTeam())
    const misplaced = rateTeam(
      makeTeam({
        ...Object.fromEntries(greatBalancedTeam().map(({ slot, player }) => [slot.id, player])),
        cb1: makePlayer({ positions: ['FWD'], nation: 'France', overall: 90, attributes: { shooting: 90, pace: 90 } }),
      }),
    )
    expect(misplaced.rating).toBeLessThan(withNaturalCb.rating)
  })

  it('rates an all-one-nation squad higher than an identical-quality scattered one', () => {
    const oneNation = rateTeam(greatBalancedTeam())
    const scattered = rateTeam(
      makeTeam(
        Object.fromEntries(
          greatBalancedTeam().map(({ slot, player }, i) => [slot.id, { ...player, nation: `Nation${i}` }]),
        ),
      ),
    )
    expect(oneNation.rating).toBeGreaterThan(scattered.rating)
  })

  it('lowers the rating when the only playmakers are stripped out', () => {
    const withPlaymakers = rateTeam(greatBalancedTeam())
    const withoutPlaymakers = rateTeam(
      makeTeam({
        ...Object.fromEntries(greatBalancedTeam().map(({ slot, player }) => [slot.id, player])),
        cdm: makePlayer({ positions: ['MID'], nation: 'France', attributes: { passing: 25, defending: 70 } }),
        cm1: makePlayer({ positions: ['MID'], nation: 'France', attributes: { passing: 25, dribbling: 70 } }),
        cm2: makePlayer({ positions: ['MID'], nation: 'France', attributes: { passing: 25, dribbling: 70 } }),
      }),
    )
    expect(withoutPlaymakers.rating).toBeLessThan(withPlaymakers.rating)
  })

  it('produces a non-empty summary for a complete team', () => {
    expect(rateTeam(greatBalancedTeam()).summary.length).toBeGreaterThan(0)
  })
})
