import type { Card } from '../types'
import { ALL_SLOTS, roleFit, rosterCards, slotCompat, starters, type Roster } from './lineup'

export interface NeedScore {
  name: string
  score: number
}

export interface TeamEvaluation {
  power: number
  quality: number
  fit: number
  chemistry: number
  balance: number
  needs: NeedScore[]
  duos: string[]
  summary: string
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

// attrs are 25-99 percentiles; normalize to 0..1
const norm = (attr: number) => clamp((attr - 25) / 74, 0, 1)

const BENCH_WEIGHT = 0.35

// ------------------------------------------------------------------ quality

// Basketball is star-driven: your best players carry far more of the
// outcome than your fifth starter, and a true superstar bends series.
// Starters are weighted by rank, and 95+ seasons earn a premium.
const STAR_WEIGHTS = [0.3, 0.24, 0.19, 0.15, 0.12]

// Star-weighted roster talent in OVR units (bench blended in light). This
// is THE number that decides games: the sim feeds it into both ends of
// the floor, so the best players genuinely win.
export function blendedTalent(roster: Roster): number {
  const cards = rosterCards(roster)
  if (cards.length === 0) return 0

  const starterOvrs = starters(roster)
    .map((c) => c.ovr)
    .sort((a, b) => b - a)
  let starterAvg = 0
  let weightSum = 0
  starterOvrs.forEach((ovr, i) => {
    const w = STAR_WEIGHTS[i] ?? 0.1
    starterAvg += ovr * w
    weightSum += w
  })
  starterAvg = weightSum > 0 ? starterAvg / weightSum : 0

  const starterSet = new Set(starters(roster).map((c) => c.id))
  const benchOvrs = cards.filter((c) => !starterSet.has(c.id)).map((c) => c.ovr)
  const benchAvg = benchOvrs.length > 0 ? benchOvrs.reduce((a, b) => a + b, 0) / benchOvrs.length : starterAvg - 12

  return starterAvg * (1 - BENCH_WEIGHT * 0.5) + benchAvg * (BENCH_WEIGHT * 0.5)
}

function computeQuality(roster: Roster): number {
  const cards = rosterCards(roster)
  if (cards.length === 0) return 0
  const starterOvrs = starters(roster).map((c) => c.ovr)
  const premium = starterOvrs.filter((ovr) => ovr >= 95).length * 1.5
  return clamp(Math.round(((blendedTalent(roster) - 50) / 49) * 100 + premium), 0, 100)
}

// ---------------------------------------------------------------------- fit

// Positional drafts score how legally each card sits in its slot; a
// positionless draft (7-footers, floor generals...) scores how well each
// card's SKILLS match the slot's role instead - Jokic at point is a
// featured fit, not a violation.
function computeFit(roster: Roster, positionless: boolean): number {
  const filled = ALL_SLOTS.filter((slot) => roster[slot] !== null)
  if (filled.length === 0) return 0
  const score = (slot: (typeof filled)[number]) =>
    positionless ? 0.45 + 0.55 * roleFit(roster[slot]!, slot) : slotCompat(roster[slot]!, slot)
  const total = filled.reduce((sum, slot) => sum + score(slot), 0)
  return clamp(Math.round((total / filled.length) * 100), 0, 100)
}

// ---------------------------------------------------------------- chemistry

// Real-life teammates: two cards that share a franchise within a 2-season
// window actually played together (e.g. '96 Jordan + '96 Pippen).
export function realTeammatePairs(cards: Card[]): [Card, Card][] {
  const pairs: [Card, Card][] = []
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]
      const b = cards[j]
      if (a.pid === b.pid) continue
      if (Math.abs(a.season - b.season) > 2) continue
      if (a.teams.some((t) => b.teams.includes(t))) pairs.push([a, b])
    }
  }
  return pairs
}

// Largest share of the team whose seasons land inside one 10-year window.
function eraCohesion(cards: Card[]): number {
  if (cards.length === 0) return 0
  let best = 0
  for (const { season } of cards) {
    const inWindow = cards.filter((c) => c.season >= season && c.season < season + 10).length
    best = Math.max(best, inWindow)
  }
  return best / cards.length
}

function computeChemistry(roster: Roster): { score: number; duos: string[] } {
  const cards = rosterCards(roster)
  if (cards.length === 0) return { score: 0, duos: [] }
  const pairs = realTeammatePairs(cards)
  const pairBonus = Math.min(60, pairs.length * 15)
  const eraBonus = eraCohesion(cards) * 40
  const duos = pairs
    .slice(0, 3)
    .map(([a, b]) => `${a.name.split(' ').at(-1)} & ${b.name.split(' ').at(-1)} ('${String(a.season).slice(2)})`)
  return { score: clamp(Math.round(pairBonus + eraBonus), 0, 100), duos }
}

// ------------------------------------------------------------------ balance

const top = (values: number[], n: number) =>
  [...values].sort((a, b) => b - a).slice(0, n)

const avg = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length)

export function needScores(roster: Roster): NeedScore[] {
  const cards = starters(roster)
  if (cards.length === 0) return []
  const of = (key: keyof Card['attrs']) => cards.map((c) => norm(c.attrs[key]))
  return [
    { name: 'scoring punch', score: Math.round(avg(top(of('sc'), 2)) * 100) },
    { name: 'outside shooting', score: Math.round(avg(top(of('sh'), 2)) * 100) },
    { name: 'playmaking', score: Math.round(Math.max(...of('pm')) * 100) },
    { name: 'rebounding', score: Math.round(avg(top(of('rb'), 2)) * 100) },
    { name: 'perimeter defense', score: Math.round(avg(top(of('df'), 2)) * 100) },
    { name: 'rim protection', score: Math.round(Math.max(...of('rm')) * 100) },
  ]
}

const GAP_THRESHOLD = 40

// "There's only one ball": five 30%-usage stars can't all eat. League-average
// five-man usage sums to ~100; past 120 the offense starts stepping on
// itself. A MILD tax by design (user-confirmed): talent rules, and five
// legends always outgun five good players - they just leave a little on
// the table.
export function usageOverload(roster: Roster): number {
  const cards = starters(roster)
  if (cards.length < 5) return 0
  const totalUsage = cards.reduce((sum, c) => sum + c.usg, 0)
  return Math.min(25, Math.max(0, Math.round((totalUsage - 120) * 0.6)))
}

function computeBalance(roster: Roster): number {
  const needs = needScores(roster)
  if (needs.length === 0) return 0
  let score = avg(needs.map((n) => n.score))
  for (const need of needs) {
    if (need.score < GAP_THRESHOLD) score -= (GAP_THRESHOLD - need.score) * 0.3
  }
  score -= usageOverload(roster)

  const cards = starters(roster)
  // Spacing: a modern offense needs at least two credible shooters on the
  // floor or the paint collapses on your scorers.
  const shooters = cards.filter((c) => c.attrs.sh >= 70).length
  if (shooters < 2) score -= (2 - shooters) * 7
  // Weak link: one unplayable defender gets hunted every possession.
  const worstDef = Math.min(...cards.map((c) => norm(c.attrs.df)))
  if (worstDef < 0.35) score -= (0.35 - worstDef) * 40

  return clamp(Math.round(score), 0, 100)
}

// ------------------------------------------------------------------ summary

function summarize(evaluation: Omit<TeamEvaluation, 'summary'>, roster: Roster): string {
  const cards = rosterCards(roster)
  if (cards.length === 0) return ''
  const lines: string[] = []

  if (evaluation.quality >= 80) lines.push('Loaded with elite talent.')
  else if (evaluation.quality >= 60) lines.push('A genuinely strong core.')
  else lines.push('Talent level is modest.')

  if (evaluation.needs.length > 0) {
    const best = evaluation.needs.reduce((a, b) => (b.score > a.score ? b : a))
    const worst = evaluation.needs.reduce((a, b) => (b.score < a.score ? b : a))
    lines.push(`Best weapon: ${best.name}.`)
    if (worst.score < GAP_THRESHOLD) lines.push(`Real weakness: ${worst.name}.`)
  }

  const overload = usageOverload(roster)
  if (overload >= 10) lines.push('Too many stars who need the ball - someone has to sacrifice.')

  if (evaluation.duos.length > 0) lines.push(`Real-life chemistry: ${evaluation.duos[0]}.`)
  else if (evaluation.chemistry < 25) lines.push('No shared history anywhere on this roster.')

  return lines.join(' ')
}

// --------------------------------------------------------------------- main

// Talent rules (user-confirmed): quality carries the power score; fit,
// chemistry, and balance refine it rather than override it.
export const POWER_WEIGHTS = { quality: 0.6, fit: 0.1, chemistry: 0.1, balance: 0.2 }

export function evaluateTeam(roster: Roster, positionless = false): TeamEvaluation {
  const quality = computeQuality(roster)
  const fit = computeFit(roster, positionless)
  const { score: chemistry, duos } = computeChemistry(roster)
  const balance = computeBalance(roster)
  const power = clamp(
    Math.round(
      quality * POWER_WEIGHTS.quality +
        fit * POWER_WEIGHTS.fit +
        chemistry * POWER_WEIGHTS.chemistry +
        balance * POWER_WEIGHTS.balance,
    ),
    0,
    100,
  )
  const partial = { power, quality, fit, chemistry, balance, needs: needScores(roster), duos }
  return { ...partial, summary: summarize(partial, roster) }
}
