import type { Attributes, Player } from '../types'
import { clamp } from './math'
import type { BuiltTeam } from './team'

interface Need {
  name: string
  weight: number
  // 0..1 coverage of this need from whichever players occupy the relevant slots.
  coverage: (bySlotId: Map<string, Player>) => number
}

function attr(player: Player | undefined, key: keyof Attributes): number {
  return player ? player.attributes[key] / 99 : 0
}

// The team's needs, independent of raw talent. A team can be full of good
// players and still fail here if it leaves a job uncovered - the "82-0"
// insight from the basketball reference game (see PRD.md section 2).
export const NEEDS: Need[] = [
  {
    name: 'goalkeeping',
    weight: 1,
    coverage: (m) => attr(m.get('gk'), 'defending'),
  },
  {
    name: 'defensive solidity',
    weight: 1.2,
    coverage: (m) => {
      const top2 = ['cb1', 'cb2', 'lb', 'rb', 'cdm']
        .map((id) => attr(m.get(id), 'defending'))
        .sort((a, b) => b - a)
        .slice(0, 2)
      return (top2[0] + top2[1]) / 2
    },
  },
  {
    name: 'creativity',
    weight: 1.2,
    coverage: (m) => Math.max(attr(m.get('cdm'), 'passing'), attr(m.get('cm1'), 'passing'), attr(m.get('cm2'), 'passing')),
  },
  {
    name: 'width',
    weight: 1,
    coverage: (m) => {
      const wingers = ['lw', 'rw']
      const pace = wingers.reduce((sum, id) => sum + attr(m.get(id), 'pace'), 0) / wingers.length
      const dribbling = wingers.reduce((sum, id) => sum + attr(m.get(id), 'dribbling'), 0) / wingers.length
      return (pace + dribbling) / 2
    },
  },
  {
    name: 'finishing',
    weight: 1.2,
    coverage: (m) => Math.max(attr(m.get('st'), 'shooting'), attr(m.get('lw'), 'shooting'), attr(m.get('rw'), 'shooting')),
  },
  {
    name: 'pace in behind',
    weight: 0.8,
    coverage: (m) => Math.max(attr(m.get('st'), 'pace'), attr(m.get('lw'), 'pace'), attr(m.get('rw'), 'pace')),
  },
  {
    name: 'aerial and physical presence',
    weight: 1,
    coverage: (m) => (attr(m.get('cb1'), 'physical') + attr(m.get('cb2'), 'physical') + attr(m.get('st'), 'physical')) / 3,
  },
]

const GAP_THRESHOLD = 45
const GAP_PENALTY_WEIGHT = 0.3

function bySlotId(team: BuiltTeam): Map<string, Player> {
  return new Map(team.map(({ slot, player }) => [slot.id, player]))
}

export function needScores(team: BuiltTeam): { name: string; score: number }[] {
  const map = bySlotId(team)
  return NEEDS.map((need) => ({ name: need.name, score: clamp(Math.round(need.coverage(map) * 100), 0, 100) }))
}

export function computeBalance(team: BuiltTeam): number {
  if (team.length === 0) return 0

  const scores = needScores(team)
  const totalWeight = NEEDS.reduce((sum, need) => sum + need.weight, 0)

  let weightedSum = 0
  let gapPenalty = 0
  scores.forEach((s, i) => {
    weightedSum += s.score * NEEDS[i].weight
    if (s.score < GAP_THRESHOLD) gapPenalty += (GAP_THRESHOLD - s.score) * GAP_PENALTY_WEIGHT
  })

  const raw = weightedSum / totalWeight
  return clamp(Math.round(raw - gapPenalty), 0, 100)
}
