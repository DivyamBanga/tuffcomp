import { describe, expect, it } from 'vitest'
import { FORMATION_433 } from './formations'
import { computeFit } from './fit'
import { makePlayer, makeTeam } from './testFixtures'

describe('computeFit', () => {
  it('is 0 for an empty team', () => {
    expect(computeFit([])).toBe(0)
  })

  it('scores every-slot-natural-position higher than a team with one illegal placement', () => {
    const natural = makeTeam()
    const misplaced = makeTeam({
      cb1: makePlayer({ positions: ['FWD'], overall: 90, attributes: { defending: 40, physical: 40 } }),
    })

    expect(computeFit(natural)).toBeGreaterThan(computeFit(misplaced))
  })

  it('rewards attribute alignment beyond bare position eligibility', () => {
    const stSlot = FORMATION_433.slots.find((s) => s.id === 'st')!

    const goodFit = [
      {
        slot: stSlot,
        player: makePlayer({ positions: ['FWD'], attributes: { shooting: 95, pace: 95 } }),
      },
    ]
    const poorFit = [
      {
        slot: stSlot,
        player: makePlayer({ positions: ['FWD'], attributes: { shooting: 40, pace: 40 } }),
      },
    ]

    expect(computeFit(goodFit)).toBeGreaterThan(computeFit(poorFit))
  })

  it('gives a midfielder stretched into defense a positive but reduced fit, not zero', () => {
    const cdmSlot = FORMATION_433.slots.find((s) => s.id === 'cdm')!
    const stretched = [{ slot: cdmSlot, player: makePlayer({ positions: ['DEF'] }) }]
    const natural = [{ slot: cdmSlot, player: makePlayer({ positions: ['MID'] }) }]

    expect(computeFit(stretched)).toBeGreaterThan(0)
    expect(computeFit(stretched)).toBeLessThan(computeFit(natural))
  })
})
