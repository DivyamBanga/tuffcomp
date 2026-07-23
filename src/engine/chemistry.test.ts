import { describe, expect, it } from 'vitest'
import { FORMATION_433 } from './formations'
import { computeChemistry } from './chemistry'
import { makePlayer, makeTeam } from './testFixtures'

describe('computeChemistry', () => {
  it('is 0 for an empty team', () => {
    expect(computeChemistry([])).toBe(0)
  })

  it('scores an all-one-nation squad higher than a scattered one', () => {
    const oneNation = makeTeam(
      Object.fromEntries(
        FORMATION_433.slots.map((slot) => [slot.id, makePlayer({ positions: [slot.position], nation: 'France' })]),
      ),
    )
    const scattered = makeTeam(
      Object.fromEntries(
        FORMATION_433.slots.map((slot, i) => [
          slot.id,
          makePlayer({ positions: [slot.position], nation: `Nation${i}` }),
        ]),
      ),
    )

    expect(computeChemistry(oneNation)).toBeGreaterThan(computeChemistry(scattered))
  })

  it('caps a single player contribution at MAX_PER_PLAYER teammates', () => {
    const gkSlot = FORMATION_433.slots.find((s) => s.id === 'gk')!
    // Two players, both France - one link each, well under the cap either way.
    const twoLinked = [
      { slot: gkSlot, player: makePlayer({ positions: ['GK'], nation: 'France' }) },
      { slot: FORMATION_433.slots.find((s) => s.id === 'cb1')!, player: makePlayer({ positions: ['DEF'], nation: 'France' }) },
    ]
    expect(computeChemistry(twoLinked)).toBeGreaterThan(0)
    expect(computeChemistry(twoLinked)).toBeLessThanOrEqual(100)
  })

  it('rewards a shared-nation spine (GK-CB-CM-ST) with a bonus', () => {
    const withoutSpine = makeTeam(
      Object.fromEntries(
        FORMATION_433.slots.map((slot, i) => [slot.id, makePlayer({ positions: [slot.position], nation: `Nation${i}` })]),
      ),
    )
    const spinePlayers = Object.fromEntries(
      FORMATION_433.slots.map((slot, i) => [slot.id, makePlayer({ positions: [slot.position], nation: `Nation${i}` })]),
    )
    for (const id of ['gk', 'cb1', 'cm1', 'st']) {
      spinePlayers[id] = makePlayer({ positions: [FORMATION_433.slots.find((s) => s.id === id)!.position], nation: 'Spine' })
    }
    const withSpine = makeTeam(spinePlayers)

    expect(computeChemistry(withSpine)).toBeGreaterThan(computeChemistry(withoutSpine))
  })
})
