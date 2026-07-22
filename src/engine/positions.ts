import type { Position } from '../types'

export const POSITIONS: Position[] = [
  'GK',
  'CB',
  'LB',
  'RB',
  'CDM',
  'CM',
  'CAM',
  'LM',
  'RM',
  'LW',
  'RW',
  'ST',
]

export const NATURAL = 1
export const SECONDARY = 0.75
export const STRETCH = 0.5
export const ILLEGAL = 0

// compatibility[from][to] = how well a player whose listed position is `from`
// can play a slot at `to`. Same-position (natural) fit is handled separately
// in positionCompatibility, so it doesn't need to be repeated here.
const COMPATIBILITY: Record<Position, Partial<Record<Position, number>>> = {
  GK: {},
  CB: { LB: SECONDARY, RB: SECONDARY, CDM: STRETCH },
  LB: { RB: STRETCH, CB: SECONDARY, CDM: STRETCH, LM: SECONDARY, LW: STRETCH },
  RB: { LB: STRETCH, CB: SECONDARY, CDM: STRETCH, RM: SECONDARY, RW: STRETCH },
  CDM: { CB: STRETCH, CM: SECONDARY },
  CM: { CDM: SECONDARY, CAM: SECONDARY },
  CAM: { CM: SECONDARY, LM: STRETCH, RM: STRETCH, LW: STRETCH, RW: STRETCH, ST: STRETCH },
  LM: { LB: SECONDARY, CM: SECONDARY, LW: SECONDARY, RM: STRETCH, CAM: STRETCH },
  RM: { RB: SECONDARY, CM: SECONDARY, RW: SECONDARY, LM: STRETCH, CAM: STRETCH },
  LW: { RW: NATURAL, LM: SECONDARY, CAM: SECONDARY, ST: STRETCH },
  RW: { LW: NATURAL, RM: SECONDARY, CAM: SECONDARY, ST: STRETCH },
  ST: { LW: SECONDARY, RW: SECONDARY, CAM: STRETCH },
}

export function positionCompatibility(from: Position, to: Position): number {
  if (from === to) return NATURAL
  return COMPATIBILITY[from][to] ?? ILLEGAL
}

// A player may be listed with more than one playable position; they get the
// best compatibility any of those positions offers for the target slot.
export function bestCompatibility(playablePositions: Position[], slot: Position): number {
  return Math.max(ILLEGAL, ...playablePositions.map((p) => positionCompatibility(p, slot)))
}

export function canPlaySlot(playablePositions: Position[], slot: Position): boolean {
  return bestCompatibility(playablePositions, slot) > ILLEGAL
}
