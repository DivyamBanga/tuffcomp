import type { Player } from '../types'
import { FORMATION_433, type FormationSlot } from './formations'

export interface BuiltSlot {
  slot: FormationSlot
  player: Player
}

// A team in progress or complete: one entry per currently-filled slot, in
// formation order. Every rating function accepts a team of any length (0 to
// 11) so the UI can show a live provisional rating while still building.
export type BuiltTeam = BuiltSlot[]

export function buildTeam(
  assignments: Record<string, Player | null>,
  formation = FORMATION_433,
): BuiltTeam {
  const team: BuiltSlot[] = []
  for (const slot of formation.slots) {
    const player = assignments[slot.id]
    if (player) team.push({ slot, player })
  }
  return team
}

export function isComplete(team: BuiltTeam, formation = FORMATION_433): boolean {
  return team.length === formation.slots.length
}
