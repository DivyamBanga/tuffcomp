import { describe, expect, it } from 'vitest'
import {
  ILLEGAL,
  NATURAL,
  POSITIONS,
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

  it('lets a defender stretch into midfield but never forward', () => {
    expect(positionCompatibility('DEF', 'MID')).toBe(STRETCH)
    expect(positionCompatibility('DEF', 'FWD')).toBe(ILLEGAL)
  })

  it('lets a forward stretch into midfield but never defense', () => {
    expect(positionCompatibility('FWD', 'MID')).toBe(STRETCH)
    expect(positionCompatibility('FWD', 'DEF')).toBe(ILLEGAL)
  })

  it('lets a midfielder stretch into defense or attack', () => {
    expect(positionCompatibility('MID', 'DEF')).toBe(STRETCH)
    expect(positionCompatibility('MID', 'FWD')).toBe(STRETCH)
  })

  it('never lets a defender and forward swap directly', () => {
    expect(positionCompatibility('DEF', 'FWD')).toBe(ILLEGAL)
    expect(positionCompatibility('FWD', 'DEF')).toBe(ILLEGAL)
  })
})

describe('bestCompatibility', () => {
  it('takes the best score across a player listed with multiple positions', () => {
    expect(bestCompatibility(['DEF', 'MID'], 'MID')).toBe(NATURAL)
    expect(bestCompatibility(['DEF'], 'FWD')).toBe(ILLEGAL)
  })
})

describe('canPlaySlot', () => {
  it('is false only when every listed position is illegal for the slot', () => {
    expect(canPlaySlot(['DEF'], 'MID')).toBe(true)
    expect(canPlaySlot(['DEF'], 'FWD')).toBe(false)
    expect(canPlaySlot(['DEF', 'FWD'], 'FWD')).toBe(true)
  })
})
