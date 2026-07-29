import { mulberry32, shuffle } from './prng'
import { simGame, simSeries, type GameResult, type SeriesResult, type TeamSimProfile } from './sim'

export interface ScheduledGame {
  homeId: string
  awayId: string
}

export interface StandingRow {
  teamId: string
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  streak: number // positive = winning streak, negative = losing streak
}

// Double round robin: every pair meets twice, once at each home.
export function makeSchedule(teamIds: string[], seed: number): ScheduledGame[] {
  const games: ScheduledGame[] = []
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      games.push({ homeId: teamIds[i], awayId: teamIds[j] })
      games.push({ homeId: teamIds[j], awayId: teamIds[i] })
    }
  }
  return shuffle(mulberry32(seed), games)
}

export interface SeasonState {
  schedule: ScheduledGame[]
  played: GameResult[]
  standings: StandingRow[]
}

export function initSeason(teamIds: string[], seed: number): SeasonState {
  return {
    schedule: makeSchedule(teamIds, seed),
    played: [],
    standings: teamIds.map((teamId) => ({
      teamId,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      streak: 0,
    })),
  }
}

export function applyResult(standings: StandingRow[], result: GameResult): StandingRow[] {
  return standings.map((row) => {
    const isHome = row.teamId === result.home.teamId
    const isAway = row.teamId === result.away.teamId
    if (!isHome && !isAway) return row
    const mine = isHome ? result.home : result.away
    const theirs = isHome ? result.away : result.home
    const won = result.winnerId === row.teamId
    return {
      ...row,
      wins: row.wins + (won ? 1 : 0),
      losses: row.losses + (won ? 0 : 1),
      pointsFor: row.pointsFor + mine.score,
      pointsAgainst: row.pointsAgainst + theirs.score,
      streak: won ? Math.max(1, row.streak + 1) : Math.min(-1, row.streak - 1),
    }
  })
}

export function sortStandings(standings: StandingRow[]): StandingRow[] {
  return [...standings].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      a.teamId.localeCompare(b.teamId),
  )
}

// Sim the next unplayed game. Returns null when the season is over.
export function simNextGame(
  season: SeasonState,
  profiles: Map<string, TeamSimProfile>,
  seed: number,
): { season: SeasonState; result: GameResult } | null {
  const index = season.played.length
  if (index >= season.schedule.length) return null
  const game = season.schedule[index]
  const result = simGame(profiles.get(game.homeId)!, profiles.get(game.awayId)!, seed + index * 104729)
  return {
    season: { ...season, played: [...season.played, result], standings: applyResult(season.standings, result) },
    result,
  }
}

// ---------------------------------------------------------------- playoffs

export interface PlayoffRound {
  name: string
  series: SeriesResult[]
}

export interface PlayoffResult {
  rounds: PlayoffRound[]
  championId: string
}

export function playoffTeamCount(leagueSize: number): number {
  return leagueSize >= 8 ? 8 : leagueSize >= 4 ? 4 : 2
}

// Seeds by final standings; 1v8, 2v7... then re-seeds each round.
export function simPlayoffs(
  seededTeamIds: string[],
  profiles: Map<string, TeamSimProfile>,
  seed: number,
  bestOf = 7,
): PlayoffResult {
  const bracketSize = playoffTeamCount(seededTeamIds.length)
  let alive = seededTeamIds.slice(0, bracketSize)
  const rounds: PlayoffRound[] = []
  const roundNames: Record<number, string> = { 8: 'Quarterfinals', 4: 'Semifinals', 2: 'THE FINALS' }

  let roundIndex = 0
  while (alive.length > 1) {
    const series: SeriesResult[] = []
    const next: string[] = []
    for (let i = 0; i < alive.length / 2; i++) {
      const higher = alive[i]
      const lower = alive[alive.length - 1 - i]
      const result = simSeries(profiles.get(higher)!, profiles.get(lower)!, seed + roundIndex * 7 + i * 1013, bestOf)
      series.push(result)
      next.push(result.winnerId)
    }
    rounds.push({ name: roundNames[alive.length] ?? `Round of ${alive.length}`, series })
    // preserve original seeding order among advancers
    alive = alive.filter((id) => next.includes(id))
    roundIndex++
  }

  return { rounds, championId: alive[0] }
}

// ------------------------------------------------------------------ awards

export interface AwardWinner {
  cardId: string
  name: string
  teamId: string
  statLine: string
}

// MVP of a set of games: best cumulative production.
export function computeMvp(games: GameResult[]): AwardWinner | null {
  const totals = new Map<string, { name: string; teamId: string; pts: number; reb: number; ast: number; games: number }>()
  for (const game of games) {
    for (const side of [game.home, game.away]) {
      for (const line of side.box) {
        const entry = totals.get(line.cardId) ?? { name: line.name, teamId: side.teamId, pts: 0, reb: 0, ast: 0, games: 0 }
        entry.pts += line.pts
        entry.reb += line.reb
        entry.ast += line.ast
        entry.games += 1
        totals.set(line.cardId, entry)
      }
    }
  }
  let best: (AwardWinner & { score: number }) | null = null
  for (const [cardId, t] of totals) {
    const score = (t.pts + 0.9 * t.reb + 0.9 * t.ast) / Math.max(1, t.games)
    if (!best || score > best.score) {
      best = {
        cardId,
        name: t.name,
        teamId: t.teamId,
        statLine: `${(t.pts / t.games).toFixed(1)} PPG / ${(t.reb / t.games).toFixed(1)} RPG / ${(t.ast / t.games).toFixed(1)} APG`,
        score,
      }
    }
  }
  return best && { cardId: best.cardId, name: best.name, teamId: best.teamId, statLine: best.statLine }
}
