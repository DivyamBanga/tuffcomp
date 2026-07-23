import { clamp } from './math'
import type { BuiltTeam } from './team'

// FIFA-style capped link chemistry: each player earns up to MAX_PER_PLAYER
// points from teammates sharing their nation. Nation-only (not also
// league/club) because the real data doesn't carry club career history at
// the scale we draw from - see PRD.md section 5.2.
const MAX_PER_PLAYER = 3

// A representative spine down the middle of the pitch. A small bonus applies
// per adjacent link that shares a nation, rewarding a cohesive spine on top
// of the base same-nation scoring.
const SPINE = ['gk', 'cb1', 'cm1', 'st']
const SPINE_BONUS_PER_LINK = 4

export function computeChemistry(team: BuiltTeam): number {
  if (team.length === 0) return 0

  const nationCounts = new Map<string, number>()
  for (const { player } of team) {
    nationCounts.set(player.nation, (nationCounts.get(player.nation) ?? 0) + 1)
  }

  let totalPoints = 0
  for (const { player } of team) {
    const teammatesSharingNation = (nationCounts.get(player.nation) ?? 1) - 1
    totalPoints += clamp(teammatesSharingNation, 0, MAX_PER_PLAYER)
  }
  const base = (totalPoints / (MAX_PER_PLAYER * team.length)) * 100

  const bySlotId = new Map(team.map(({ slot, player }) => [slot.id, player]))
  let spineBonus = 0
  for (let i = 0; i < SPINE.length - 1; i++) {
    const a = bySlotId.get(SPINE[i])
    const b = bySlotId.get(SPINE[i + 1])
    if (a && b && a.nation === b.nation) spineBonus += SPINE_BONUS_PER_LINK
  }

  return clamp(Math.round(base + spineBonus), 0, 100)
}
