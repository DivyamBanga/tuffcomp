import type { Attributes } from '../types'
import { clamp } from './math'
import { bestCompatibility } from './positions'
import type { BuiltTeam } from './team'

// Which attributes matter for each slot's cosmetic role, and how much. Even
// though eligibility only checks the broad position, the role still carries
// a profile so a fast, defensively sound fullback rates as a better fit for
// LB than a slow one, even though both are just "DEF" for eligibility.
type AttributeProfile = Partial<Record<keyof Attributes, number>>

export const SLOT_ATTRIBUTE_PROFILES: Record<string, AttributeProfile> = {
  gk: { defending: 0.7, physical: 0.3 },
  lb: { pace: 0.5, defending: 0.5 },
  rb: { pace: 0.5, defending: 0.5 },
  cb1: { defending: 0.6, physical: 0.4 },
  cb2: { defending: 0.6, physical: 0.4 },
  cdm: { defending: 0.5, passing: 0.5 },
  cm1: { passing: 0.5, dribbling: 0.5 },
  cm2: { passing: 0.5, dribbling: 0.5 },
  lw: { pace: 0.5, dribbling: 0.5 },
  rw: { pace: 0.5, dribbling: 0.5 },
  st: { shooting: 0.6, pace: 0.4 },
}

function attributeAlignment(profile: AttributeProfile, attributes: Attributes): number {
  let score = 0
  for (const [key, weight] of Object.entries(profile) as [keyof Attributes, number][]) {
    score += (attributes[key] / 99) * weight
  }
  return score
}

export function computeFit(team: BuiltTeam): number {
  if (team.length === 0) return 0

  const slotFits = team.map(({ slot, player }) => {
    const positionFit = bestCompatibility(player.positions, slot.position)
    const attrFit = attributeAlignment(SLOT_ATTRIBUTE_PROFILES[slot.id] ?? {}, player.attributes)
    return 0.6 * positionFit + 0.4 * attrFit
  })

  const average = slotFits.reduce((a, b) => a + b, 0) / slotFits.length
  return clamp(Math.round(average * 100), 0, 100)
}
