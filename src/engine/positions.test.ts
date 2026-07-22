import { describe, expect, it } from 'vitest'
import {
  ILLEGAL,
  NATURAL,
  POSITIONS,
  SECONDARY,
  STRETCH,
  bestCompatibility,
  canPlaySlot,
  positionCompatibility,
} from './positions'

describe('positionCompatibility', () => {
  it('is natural for a player at their own position', () => {
    for (const position of POSITIONS) {
      expect(positionCompatibility(position, position)).toBe(NATURAL)
    }
  })

  it('only a goalkeeper can play the goalkeeper slot', () => {
    const outfield = POSITIONS.filter((p) => p !== 'GK')
    for (const from of outfield) {
      expect(positionCompatibility(from, 'GK')).toBe(ILLEGAL)
    }
  })

  it('keeps a goalkeeper off every outfield slot', () => {
    const outfield = POSITIONS.filter((p) => p !== 'GK')
    for (const to of outfield) {
      expect(positionCompatibility('GK', to)).toBe(ILLEGAL)
    }
  })

  it('lets a center back cover full back as secondary and CDM as a stretch, never attack', () => {
    expect(positionCompatibility('CB', 'LB')).toBe(SECONDARY)
    expect(positionCompatibility('CB', 'RB')).toBe(SECONDARY)
    expect(positionCompatibility('CB', 'CDM')).toBe(STRETCH)
    expect(positionCompatibility('CB', 'ST')).toBe(ILLEGAL)
    expect(positionCompatibility('CB', 'CAM')).toBe(ILLEGAL)
    expect(positionCompatibility('CB', 'LW')).toBe(ILLEGAL)
    expect(positionCompatibility('CB', 'RW')).toBe(ILLEGAL)
  })

  it('lets a winger cover the opposite wing naturally, CAM as secondary, striker as a stretch, never defense', () => {
    expect(positionCompatibility('LW', 'RW')).toBe(NATURAL)
    expect(positionCompatibility('RW', 'LW')).toBe(NATURAL)
    expect(positionCompatibility('LW', 'CAM')).toBe(SECONDARY)
    expect(positionCompatibility('LW', 'ST')).toBe(STRETCH)
    expect(positionCompatibility('LW', 'CB')).toBe(ILLEGAL)
    expect(positionCompatibility('LW', 'LB')).toBe(ILLEGAL)
  })

  it('lets a striker cover a wing as secondary and CAM as a stretch, never defense', () => {
    expect(positionCompatibility('ST', 'LW')).toBe(SECONDARY)
    expect(positionCompatibility('ST', 'RW')).toBe(SECONDARY)
    expect(positionCompatibility('ST', 'CAM')).toBe(STRETCH)
    expect(positionCompatibility('ST', 'CB')).toBe(ILLEGAL)
    expect(positionCompatibility('ST', 'CDM')).toBe(ILLEGAL)
  })
})

describe('bestCompatibility', () => {
  it('takes the best score across a player listed with multiple positions', () => {
    expect(bestCompatibility(['ST', 'LW'], 'RW')).toBe(NATURAL)
    expect(bestCompatibility(['CB'], 'ST')).toBe(ILLEGAL)
  })
})

describe('canPlaySlot', () => {
  it('is false only when every listed position is illegal for the slot', () => {
    expect(canPlaySlot(['CB'], 'LB')).toBe(true)
    expect(canPlaySlot(['CB'], 'ST')).toBe(false)
    expect(canPlaySlot(['CB', 'ST'], 'ST')).toBe(true)
  })
})
