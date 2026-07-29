import { describe, expect, it } from 'vitest'
import { canFieldStarters, canPlaySlot, eligibleSlots, slotCompat } from './lineup'
import { makeCard } from './testFixtures'

describe('slot compatibility', () => {
  it('a card is natural at its own position', () => {
    expect(slotCompat(makeCard({ pos: 'PG' }), 'PG')).toBe(1)
    expect(slotCompat(makeCard({ pos: 'C' }), 'C')).toBe(1)
  })

  it('neighboring positions are a stretch, two apart is illegal', () => {
    const sg = makeCard({ pos: 'SG' })
    expect(slotCompat(sg, 'PG')).toBeCloseTo(0.55)
    expect(slotCompat(sg, 'SF')).toBeCloseTo(0.55)
    expect(canPlaySlot(sg, 'PF')).toBe(false)
    expect(canPlaySlot(sg, 'C')).toBe(false)
  })

  it('no centers running point, no point guards at center', () => {
    expect(canPlaySlot(makeCard({ pos: 'C' }), 'PG')).toBe(false)
    expect(canPlaySlot(makeCard({ pos: 'PG' }), 'C')).toBe(false)
  })

  it('secondary position expands eligibility', () => {
    const combo = makeCard({ pos: 'SF', pos2: 'PF' })
    expect(slotCompat(combo, 'PF')).toBe(1)
    expect(canPlaySlot(combo, 'C')).toBe(true) // stretch via PF
  })

  it('bench slots take anyone at full value', () => {
    expect(slotCompat(makeCard({ pos: 'C' }), 'B1')).toBe(1)
  })

  it('eligibleSlots always includes all bench slots', () => {
    const slots = eligibleSlots(makeCard({ pos: 'C' }))
    expect(slots).toContain('B1')
    expect(slots).toContain('C')
    expect(slots).not.toContain('PG')
  })
})

describe('canFieldStarters', () => {
  it('accepts one natural player per position', () => {
    const cards = (['PG', 'SG', 'SF', 'PF', 'C'] as const).map((pos) => makeCard({ pos }))
    expect(canFieldStarters(cards)).toBe(true)
  })

  it('accepts stretch coverage (two PGs, no SG)', () => {
    const cards = [
      makeCard({ pos: 'PG' }),
      makeCard({ pos: 'PG' }),
      makeCard({ pos: 'SF' }),
      makeCard({ pos: 'PF' }),
      makeCard({ pos: 'C' }),
    ]
    expect(canFieldStarters(cards)).toBe(true)
  })

  it('rejects five centers', () => {
    const cards = Array.from({ length: 5 }, () => makeCard({ pos: 'C' }))
    expect(canFieldStarters(cards)).toBe(false)
  })
})
