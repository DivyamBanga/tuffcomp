import { needScores } from './balance'
import { bestCompatibility } from './positions'
import type { BuiltTeam } from './team'

function qualityLine(quality: number): string {
  if (quality >= 85) return 'Elite talent from back to front.'
  if (quality >= 70) return 'Strong, well above-average talent throughout.'
  if (quality >= 55) return 'Solid, functional talent across the XI.'
  return 'Talent level is a real weakness here.'
}

function fitLine(team: BuiltTeam): string {
  const stretched = team.filter(({ slot, player }) => bestCompatibility(player.positions, slot.position) < 1)
  if (stretched.length === 0) return 'Every player is comfortably in position.'
  const named = stretched.slice(0, 2).map(({ slot, player }) => `${player.name} at ${slot.label}`)
  const verb = stretched.length > 1 ? 'are' : 'is'
  return `${named.join(' and ')} ${verb} a stretch out of natural position.`
}

function chemistryLine(team: BuiltTeam): string {
  if (team.length === 0) return ''
  const counts = new Map<string, number>()
  for (const { player } of team) counts.set(player.nation, (counts.get(player.nation) ?? 0) + 1)
  const [topNation, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topCount >= 5) return `Strong chemistry built around a ${topNation} core (${topCount} players).`
  if (topCount <= 2) return 'A scattered mix of nations gives you almost no chemistry.'
  return `Some chemistry, anchored by ${topCount} ${topNation} players.`
}

function balanceLine(team: BuiltTeam): string {
  const scores = needScores(team)
  if (scores.length === 0) return ''
  const weakest = scores.reduce((worst, s) => (s.score < worst.score ? s : worst))
  if (weakest.score < 45) return `Thin on ${weakest.name} - that's the biggest gap in this XI.`
  return 'Well balanced - every key job on the pitch is covered.'
}

export function summarize(team: BuiltTeam, quality: number): string {
  if (team.length === 0) return ''
  return [qualityLine(quality), fitLine(team), chemistryLine(team), balanceLine(team)].join(' ')
}
