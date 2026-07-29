import type { Card } from '../types'
import { evaluateTeam, usageOverload } from './evaluate'
import { ALL_SLOTS, STARTER_SLOTS, rosterCards, type Roster } from './lineup'
import { mulberry32, randNormal, type Rng } from './prng'

// ------------------------------------------------------------- sim profiles

export interface SimPlayer {
  card: Card
  starter: boolean
  minutes: number
  usageShare: number
}

export interface TeamSimProfile {
  teamId: string
  offense: number
  defense: number
  players: SimPlayer[]
}

const STARTER_MINUTES = 34
const BENCH_MINUTES = (48 * 5 - STARTER_MINUTES * 5) / 3 // remaining minutes split across bench

function weightedAttrAvg(roster: Roster, key: keyof Card['attrs']): number {
  let sum = 0
  let weights = 0
  for (const slot of ALL_SLOTS) {
    const card = roster[slot]
    if (!card) continue
    const starter = (STARTER_SLOTS as readonly string[]).includes(slot)
    const w = starter ? 1 : 0.35
    sum += card.attrs[key] * w
    weights += w
  }
  return weights === 0 ? 0 : sum / weights
}

// Distills a roster into the numbers the game sim runs on. Chemistry and
// balance (from the evaluation engine) nudge offense/defense so "best
// fitting" teams genuinely win more - the algorithm the game is built on.
export function simProfile(teamId: string, roster: Roster): TeamSimProfile {
  const evaluation = evaluateTeam(roster)

  let offense =
    0.52 * weightedAttrAvg(roster, 'sc') +
    0.22 * weightedAttrAvg(roster, 'sh') +
    0.26 * weightedAttrAvg(roster, 'pm')
  let defense =
    0.5 * weightedAttrAvg(roster, 'df') +
    0.28 * weightedAttrAvg(roster, 'rm') +
    0.22 * weightedAttrAvg(roster, 'rb')

  offense += (evaluation.chemistry - 50) * 0.07 - usageOverload(roster) * 0.35
  defense += (evaluation.balance - 50) * 0.05

  const players: SimPlayer[] = []
  for (const slot of ALL_SLOTS) {
    const card = roster[slot]
    if (!card) continue
    const starter = (STARTER_SLOTS as readonly string[]).includes(slot)
    players.push({ card, starter, minutes: starter ? STARTER_MINUTES : BENCH_MINUTES, usageShare: 0 })
  }
  const totalUsage = players.reduce((sum, p) => sum + p.card.usg * p.minutes, 0)
  for (const p of players) p.usageShare = totalUsage === 0 ? 1 / players.length : (p.card.usg * p.minutes) / totalUsage

  return { teamId, offense, defense, players }
}

// ------------------------------------------------------------------ boxscore

export interface BoxLine {
  cardId: string
  name: string
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
}

export interface TeamGameResult {
  teamId: string
  score: number
  quarters: number[]
  box: BoxLine[]
}

export interface GameResult {
  home: TeamGameResult
  away: TeamGameResult
  winnerId: string
  overtimes: number
  star: { cardId: string; name: string; teamId: string; line: string }
}

// Largest-remainder rounding so integer stat lines sum exactly to the total.
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  const exact = weights.map((w) => (w / sum) * total)
  const floors = exact.map(Math.floor)
  let remaining = total - floors.reduce((a, b) => a + b, 0)
  const order = exact
    .map((v, i) => ({ frac: v - floors[i], i }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < order.length && remaining > 0; k++, remaining--) floors[order[k].i]++
  return floors
}

function buildBox(profile: TeamSimProfile, teamScore: number, rng: Rng): BoxLine[] {
  const players = profile.players
  const scoringWeights = players.map(
    (p) => p.usageShare * (0.6 + 0.8 * ((p.card.attrs.sc - 25) / 74)) * (0.85 + rng() * 0.3),
  )
  const points = apportion(teamScore, scoringWeights)

  const totalReb = Math.round(randNormal(rng, 43, 3))
  const rebounds = apportion(totalReb, players.map((p) => p.minutes * (0.3 + (p.card.attrs.rb - 25) / 74) * (0.85 + rng() * 0.3)))

  const totalAst = Math.round(teamScore * (0.23 + rng() * 0.04))
  const assists = apportion(totalAst, players.map((p) => p.minutes * (0.2 + (p.card.attrs.pm - 25) / 74) * (0.85 + rng() * 0.3)))

  const totalStl = Math.round(randNormal(rng, 7.5, 1.6))
  const steals = apportion(Math.max(2, totalStl), players.map((p) => p.minutes * (0.2 + (p.card.attrs.df - 25) / 74)))

  const totalBlk = Math.round(randNormal(rng, 5, 1.5))
  const blocks = apportion(Math.max(1, totalBlk), players.map((p) => p.minutes * (0.15 + (p.card.attrs.rm - 25) / 74)))

  return players.map((p, i) => ({
    cardId: p.card.id,
    name: p.card.name,
    pts: points[i],
    reb: rebounds[i],
    ast: assists[i],
    stl: steals[i],
    blk: blocks[i],
  }))
}

// ------------------------------------------------------------------ the sim

const LEAGUE_BASELINE = 111
const HOME_ADVANTAGE = 1.6

export function expectedPoints(offense: number, opponentDefense: number, home: boolean): number {
  return LEAGUE_BASELINE + (offense - opponentDefense) * 0.55 + (home ? HOME_ADVANTAGE : 0)
}

export function simGame(home: TeamSimProfile, away: TeamSimProfile, seed: number): GameResult {
  const rng = mulberry32(seed)

  const homeExpected = expectedPoints(home.offense, away.defense, true)
  const awayExpected = expectedPoints(away.offense, home.defense, false)

  const homeQuarters: number[] = []
  const awayQuarters: number[] = []
  for (let q = 0; q < 4; q++) {
    homeQuarters.push(Math.max(11, Math.round(randNormal(rng, homeExpected / 4, 4.4))))
    awayQuarters.push(Math.max(11, Math.round(randNormal(rng, awayExpected / 4, 4.4))))
  }

  let overtimes = 0
  let homeScore = homeQuarters.reduce((a, b) => a + b, 0)
  let awayScore = awayQuarters.reduce((a, b) => a + b, 0)
  while (homeScore === awayScore) {
    overtimes++
    const homeOt = Math.max(4, Math.round(randNormal(rng, homeExpected / 16, 2.4)))
    const awayOt = Math.max(4, Math.round(randNormal(rng, awayExpected / 16, 2.4)))
    homeQuarters.push(homeOt)
    awayQuarters.push(awayOt)
    homeScore += homeOt
    awayScore += awayOt
  }

  const homeBox = buildBox(home, homeScore, rng)
  const awayBox = buildBox(away, awayScore, rng)

  const allLines = [
    ...homeBox.map((line) => ({ line, teamId: home.teamId })),
    ...awayBox.map((line) => ({ line, teamId: away.teamId })),
  ]
  const starEntry = allLines.reduce((best, entry) =>
    entry.line.pts + 0.9 * entry.line.reb + 0.9 * entry.line.ast + 1.5 * (entry.line.stl + entry.line.blk) >
    best.line.pts + 0.9 * best.line.reb + 0.9 * best.line.ast + 1.5 * (best.line.stl + best.line.blk)
      ? entry
      : best,
  )

  return {
    home: { teamId: home.teamId, score: homeScore, quarters: homeQuarters, box: homeBox },
    away: { teamId: away.teamId, score: awayScore, quarters: awayQuarters, box: awayBox },
    winnerId: homeScore > awayScore ? home.teamId : away.teamId,
    overtimes,
    star: {
      cardId: starEntry.line.cardId,
      name: starEntry.line.name,
      teamId: starEntry.teamId,
      line: `${starEntry.line.pts} PTS / ${starEntry.line.reb} REB / ${starEntry.line.ast} AST`,
    },
  }
}

// ------------------------------------------------------------------- series

export interface SeriesResult {
  games: GameResult[]
  winnerId: string
  loserId: string
  tally: Record<string, number>
}

// 2-2-1-1-1 home court for the higher seed (passed first).
export function simSeries(higher: TeamSimProfile, lower: TeamSimProfile, seed: number, bestOf = 7): SeriesResult {
  const needed = Math.ceil(bestOf / 2)
  const homePattern = [true, true, false, false, true, false, true]
  const games: GameResult[] = []
  const tally: Record<string, number> = { [higher.teamId]: 0, [lower.teamId]: 0 }

  for (let g = 0; g < bestOf; g++) {
    if (tally[higher.teamId] === needed || tally[lower.teamId] === needed) break
    const higherIsHome = homePattern[g % homePattern.length]
    const result = higherIsHome
      ? simGame(higher, lower, seed + g * 7919)
      : simGame(lower, higher, seed + g * 7919)
    games.push(result)
    tally[result.winnerId]++
  }

  const winnerId = tally[higher.teamId] > tally[lower.teamId] ? higher.teamId : lower.teamId
  return { games, winnerId, loserId: winnerId === higher.teamId ? lower.teamId : higher.teamId, tally }
}
