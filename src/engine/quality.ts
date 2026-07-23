import { clamp } from './math'
import type { BuiltTeam } from './team'

// Not every slot matters equally - a world-class striker or goalkeeper moves
// the needle more than a slightly better full back. Weights sum to 1 across
// a complete XI.
export const SLOT_WEIGHTS: Record<string, number> = {
  gk: 0.09,
  lb: 0.06,
  cb1: 0.08,
  cb2: 0.08,
  rb: 0.06,
  cdm: 0.1,
  cm1: 0.09,
  cm2: 0.09,
  lw: 0.1,
  st: 0.15,
  rw: 0.1,
}

// A weighted average of overall across whichever slots are currently filled,
// not a weighted sum - that way a 3-slot partial team is scored on the
// quality of those 3 players, not penalized just for not being full yet.
export function computeQuality(team: BuiltTeam): number {
  if (team.length === 0) return 0

  let weightedSum = 0
  let weightTotal = 0
  for (const { slot, player } of team) {
    const weight = SLOT_WEIGHTS[slot.id] ?? 0
    weightedSum += player.overall * weight
    weightTotal += weight
  }
  if (weightTotal === 0) return 0

  return clamp(Math.round(weightedSum / weightTotal), 0, 100)
}
