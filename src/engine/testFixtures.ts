import type { Attributes, Player, Position } from '../types'
import { FORMATION_433 } from './formations'
import type { BuiltTeam } from './team'

const DEFAULT_ATTRIBUTES: Attributes = {
  pace: 70,
  shooting: 70,
  passing: 70,
  dribbling: 70,
  defending: 70,
  physical: 70,
}

let counter = 0

export function makePlayer(overrides: Partial<Omit<Player, 'attributes'>> & { attributes?: Partial<Attributes> } = {}): Player {
  counter += 1
  return {
    id: overrides.id ?? `fixture-${counter}`,
    name: overrides.name ?? `Fixture Player ${counter}`,
    nation: overrides.nation ?? 'Testland',
    year: overrides.year ?? 2020,
    overall: overrides.overall ?? 75,
    positions: overrides.positions ?? (['MID'] as Position[]),
    attributes: { ...DEFAULT_ATTRIBUTES, ...overrides.attributes },
  }
}

// Builds a full 11-slot team. Any slot not given an explicit player gets a
// generic default player whose position naturally matches that slot.
export function makeTeam(playersBySlotId: Record<string, Player> = {}): BuiltTeam {
  return FORMATION_433.slots.map((slot) => ({
    slot,
    player: playersBySlotId[slot.id] ?? makePlayer({ positions: [slot.position] }),
  }))
}
