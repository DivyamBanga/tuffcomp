import type { Position } from '../types'

export const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD']

export const NATURAL = 1
export const STRETCH = 0.5
export const ILLEGAL = 0

// compatibility[from][to] = how well a player whose position is `from` can
// play a slot at `to`. Same-position (natural) fit is handled separately in
// positionCompatibility, so it doesn't need to be repeated here.
const COMPATIBILITY: Record<Position, Partial<Record<Position, number>>> = {
  GK: {},
  DEF: { MID: STRETCH },
  MID: { DEF: STRETCH, FWD: STRETCH },
  FWD: { MID: STRETCH },
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
