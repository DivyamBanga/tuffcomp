import { describe, expect, it } from 'vitest'
import { FORMATION_433 } from './formations'
import { computeQuality, SLOT_WEIGHTS } from './quality'
import { makePlayer, makeTeam } from './testFixtures'

function uniformTeam(overall: number) {
  return makeTeam(
    Object.fromEntries(
      FORMATION_433.slots.map((slot) => [slot.id, makePlayer({ positions: [slot.position], overall })]),
    ),
  )
}

describe('SLOT_WEIGHTS', () => {
  it('sums to 1 across a complete XI', () => {
    const total = Object.values(SLOT_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 5)
  })
})

describe('computeQuality', () => {
  it('is 0 for an empty team', () => {
    expect(computeQuality([])).toBe(0)
  })

  it('rewards higher overalls', () => {
    expect(computeQuality(uniformTeam(90))).toBeGreaterThan(computeQuality(uniformTeam(55)))
  })

  it('scores a uniform-overall team at exactly that overall', () => {
    expect(computeQuality(uniformTeam(80))).toBe(80)
  })

  it('is a weighted average, not a weighted sum, so partial teams are not penalized for being incomplete', () => {
    const gkSlot = FORMATION_433.slots.find((s) => s.id === 'gk')!
    const onlyGk = [{ slot: gkSlot, player: makePlayer({ positions: ['GK'], overall: 90 }) }]
    expect(computeQuality(onlyGk)).toBe(90)
  })

  it('weights a striker upgrade more than an equivalent full back upgrade', () => {
    const base = Object.fromEntries(
      FORMATION_433.slots.map((slot) => [slot.id, makePlayer({ positions: [slot.position], overall: 70 })]),
    )

    const stBoost = makeTeam({ ...base, st: makePlayer({ positions: ['FWD'], overall: 90 }) })
    const lbBoost = makeTeam({ ...base, lb: makePlayer({ positions: ['DEF'], overall: 90 }) })

    expect(computeQuality(stBoost)).toBeGreaterThan(computeQuality(lbBoost))
  })
})
