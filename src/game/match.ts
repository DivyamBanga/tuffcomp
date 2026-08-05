import type { Card } from '../types'
import { evaluateTeam } from '../engine/evaluate'
import { canPlaySlot, rosterCards, type Roster, type SlotId } from '../engine/lineup'
import { hashSeed, mulberry32, shuffle } from '../engine/prng'
import { simGame, simProfile, type GameResult, type TeamSimProfile } from '../engine/sim'
import { judgeAdjustments, type LeagueJudgment } from '../llm/judge'
import {
  applyAction as applyDraftAction,
  advanceCpuTurns,
  draftFillerTeam,
  initDraft,
  type DraftAction,
  type DraftCtx,
  type DraftMode,
  type DraftPlayer,
  type DraftState,
  type PickInput,
} from './draft'
import {
  applyResult,
  computeMvp,
  initSeason,
  playoffTeamCount,
  sortStandings,
  type AwardWinner,
  type SeasonState,
} from '../engine/season'

// ----------------------------------------------------------------- config

// 'chase' is the solo 82-0 run: draft under the theme, then your squad
// plays an 82-game season against generated opposition - the record is
// the score.
export type MatchFormat = 'season' | 'series' | 'chase'

export const CHASE_GAMES = 82
const CHASE_OPPONENTS = 14

export interface MatchConfig {
  mode: DraftMode
  format: MatchFormat
  leagueSize: number
  seed: number
  // Theme mode pick style; absent means 'type' (blind typing).
  input?: PickInput
}

export type MatchPhase = 'draft' | 'preview' | 'season' | 'playoffs' | 'done'

export interface TeamEntry {
  id: string
  name: string
  isCpu: boolean
  isFiller: boolean
}

export interface PlayoffMatchup {
  higherId: string
  lowerId: string
  games: GameResult[]
  tally: Record<string, number>
  winnerId: string | null
}

export interface PlayoffRoundState {
  name: string
  matchups: PlayoffMatchup[]
}

export interface MatchState {
  config: MatchConfig
  entries: TeamEntry[]
  phase: MatchPhase
  draft: DraftState | null
  rosters: Record<string, Roster>
  // Optional AI scouting report; nudges the sim within hard caps.
  judge: LeagueJudgment | null
  season: SeasonState | null
  playoffRounds: PlayoffRoundState[]
  seeds: string[]
  championId: string | null
  seasonMvp: AwardWinner | null
  finalsMvp: AwardWinner | null
}

export type MatchAction =
  | { type: 'DRAFT'; action: DraftAction }
  | { type: 'SET_JUDGE'; judgment: LeagueJudgment }
  | { type: 'BEGIN_COMPETITION' }
  | { type: 'SIM_NEXT' }
  | { type: 'MOVE_AFTER_DRAFT'; playerId: string; from: SlotId; to: SlotId }

const FILLER_NAMES = [
  'NEON SHARKS',
  'VOID VIPERS',
  'CHROME WOLVES',
  'STATIC STORM',
  'MIDNIGHT MAMBAS',
  'LASER LIONS',
  'TURBO TITANS',
  'PIXEL PISTONS',
]

// ------------------------------------------------------------------ init

export function initMatch(config: MatchConfig, players: DraftPlayer[], ctx: DraftCtx): MatchState {
  const draft = advanceCpuTurns(initDraft(config.mode, players, config.seed, ctx, config.input ?? 'type'), ctx)
  return {
    config,
    entries: players.map((p) => ({ id: p.id, name: p.name, isCpu: p.isCpu, isFiller: false })),
    phase: 'draft',
    draft,
    rosters: {},
    judge: null,
    season: null,
    playoffRounds: [],
    seeds: [],
    championId: null,
    seasonMvp: null,
    finalsMvp: null,
  }
}

// --------------------------------------------------------------- helpers

export function buildProfiles(state: MatchState): Map<string, TeamSimProfile> {
  const ids = Object.keys(state.rosters)
  const adjustments = state.judge ? judgeAdjustments(state.judge, ids) : null
  return new Map(
    ids.map((id) => {
      const profile = simProfile(id, state.rosters[id])
      const adj = adjustments?.get(id)
      if (adj) {
        profile.offense += adj.dOff
        profile.defense += adj.dDef
      }
      return [id, profile]
    }),
  )
}

export function entryName(state: MatchState, id: string): string {
  return state.entries.find((e) => e.id === id)?.name ?? id
}

function finishDraft(state: MatchState, ctx: DraftCtx): MatchState {
  const draft = state.draft!
  const rosters: Record<string, Roster> = {}
  for (const player of draft.players) rosters[player.id] = draft.teams[player.id].roster

  // Generate the opposition from the leftovers: league fillers pad a
  // friends match; a chase run gets a full slate of strong opponents.
  const chase = state.config.format === 'chase'
  const targetSize = chase ? 1 + CHASE_OPPONENTS : state.config.leagueSize
  const entries = [...state.entries]
  const drafted = new Set(draft.draftedPids)
  const names = shuffle(mulberry32(hashSeed(`${state.config.seed}:fillers`)), FILLER_NAMES)
  let fillerIndex = 0
  while (entries.length < targetSize) {
    const filler = draftFillerTeam(drafted, ctx, hashSeed(`${state.config.seed}:filler:${fillerIndex}`), chase ? 0.8 : 0.6)
    const id = `filler-${fillerIndex}`
    entries.push({ id, name: names[fillerIndex % names.length], isCpu: true, isFiller: true })
    rosters[id] = filler.roster
    for (const pid of filler.draftedPids) drafted.add(pid)
    fillerIndex++
  }

  return { ...state, entries, rosters, phase: 'preview' }
}

// The chase schedule: 82 games, all involving the runner, cycling through
// the opposition with alternating home court.
function chaseSchedule(myId: string, opponentIds: string[]): { homeId: string; awayId: string }[] {
  const games: { homeId: string; awayId: string }[] = []
  for (let g = 0; g < CHASE_GAMES; g++) {
    const opp = opponentIds[g % opponentIds.length]
    games.push(g % 2 === 0 ? { homeId: myId, awayId: opp } : { homeId: opp, awayId: myId })
  }
  return games
}

// Seed order: season format seeds by standings later; series format seeds by
// evaluated team power right away.
function powerSeeds(state: MatchState): string[] {
  return [...state.entries]
    .map((e) => ({ id: e.id, power: evaluateTeam(state.rosters[e.id]).power }))
    .sort((a, b) => b.power - a.power || a.id.localeCompare(b.id))
    .map((x) => x.id)
}

function roundName(count: number): string {
  return count === 1 ? 'THE FINALS' : count === 2 ? 'SEMIFINALS' : 'QUARTERFINALS'
}

function buildRound(seeds: string[]): PlayoffRoundState {
  const matchups: PlayoffMatchup[] = []
  for (let i = 0; i < seeds.length / 2; i++) {
    const higherId = seeds[i]
    const lowerId = seeds[seeds.length - 1 - i]
    matchups.push({ higherId, lowerId, games: [], tally: { [higherId]: 0, [lowerId]: 0 }, winnerId: null })
  }
  return { name: roundName(matchups.length), matchups }
}

function startPlayoffs(state: MatchState, seeds: string[]): MatchState {
  const bracket = seeds.slice(0, playoffTeamCount(seeds.length))
  return { ...state, phase: 'playoffs', seeds: bracket, playoffRounds: [buildRound(bracket)] }
}

const SERIES_NEEDED = 4
const HOME_PATTERN = [true, true, false, false, true, false, true]

function simPlayoffStep(state: MatchState): MatchState {
  const rounds = state.playoffRounds.map((r) => ({ ...r, matchups: r.matchups.map((m) => ({ ...m })) }))
  const round = rounds[rounds.length - 1]
  const matchup = round.matchups.find((m) => m.winnerId === null)
  if (!matchup) return state

  const profiles = buildProfiles(state)
  const gameIndex = matchup.games.length
  const higherHome = HOME_PATTERN[gameIndex % HOME_PATTERN.length]
  const seedNum = hashSeed(`${state.config.seed}:po:${rounds.length}:${matchup.higherId}:${matchup.lowerId}:${gameIndex}`)
  const result = higherHome
    ? simGame(profiles.get(matchup.higherId)!, profiles.get(matchup.lowerId)!, seedNum)
    : simGame(profiles.get(matchup.lowerId)!, profiles.get(matchup.higherId)!, seedNum)

  matchup.games = [...matchup.games, result]
  matchup.tally = { ...matchup.tally, [result.winnerId]: matchup.tally[result.winnerId] + 1 }
  if (matchup.tally[result.winnerId] >= SERIES_NEEDED) matchup.winnerId = result.winnerId

  let next: MatchState = { ...state, playoffRounds: rounds }

  const roundDone = round.matchups.every((m) => m.winnerId !== null)
  if (roundDone) {
    const advancers = next.seeds.filter((id) => round.matchups.some((m) => m.winnerId === id))
    if (advancers.length === 1) {
      const finalsGames = round.matchups[0].games
      return {
        ...next,
        phase: 'done',
        championId: advancers[0],
        finalsMvp: computeMvp(finalsGames.filter((g) => [g.home.teamId, g.away.teamId].includes(advancers[0]))),
      }
    }
    next = { ...next, seeds: advancers, playoffRounds: [...rounds, buildRound(advancers)] }
  }
  return next
}

function simSeasonStep(state: MatchState): MatchState {
  const season = state.season!
  const index = season.played.length
  if (index >= season.schedule.length) return state
  const game = season.schedule[index]
  const profiles = buildProfiles(state)
  const result = simGame(
    profiles.get(game.homeId)!,
    profiles.get(game.awayId)!,
    hashSeed(`${state.config.seed}:season:${index}`),
  )
  const nextSeason: SeasonState = {
    ...season,
    played: [...season.played, result],
    standings: applyResult(season.standings, result),
  }
  let next: MatchState = { ...state, season: nextSeason }

  if (nextSeason.played.length >= nextSeason.schedule.length) {
    if (state.config.format === 'chase') {
      // The run is over: a perfect 82-0 takes the ring, anything else just
      // posts the record.
      const myId = state.entries.find((e) => !e.isFiller)!.id
      const myRow = nextSeason.standings.find((r) => r.teamId === myId)!
      return {
        ...next,
        phase: 'done',
        championId: myRow.losses === 0 ? myId : null,
        seasonMvp: computeMvp(nextSeason.played.filter((g) => [g.home.teamId, g.away.teamId].includes(myId))),
      }
    }
    const table = sortStandings(nextSeason.standings).map((r) => r.teamId)
    next = startPlayoffs({ ...next, seasonMvp: computeMvp(nextSeason.played) }, table)
  }
  return next
}

// --------------------------------------------------------------- reducer

export function applyMatchAction(state: MatchState, action: MatchAction, ctx: DraftCtx): MatchState {
  if (action.type === 'DRAFT') {
    if (state.phase !== 'draft' || !state.draft) return state
    let draft = applyDraftAction(state.draft, action.action, ctx)
    if (draft === state.draft) return state
    draft = advanceCpuTurns(draft, ctx)
    const next = { ...state, draft }
    return draft.done ? finishDraft(next, ctx) : next
  }

  // Rearranging your lineup between draft end and tip-off.
  if (action.type === 'MOVE_AFTER_DRAFT') {
    if (state.phase !== 'preview') return state
    const roster = state.rosters[action.playerId]
    if (!roster) return state
    const fromCard = roster[action.from]
    const toCard = roster[action.to]
    if (!fromCard || !canPlaySlot(fromCard, action.to)) return state
    if (toCard && !canPlaySlot(toCard, action.from)) return state
    const moved: Roster = { ...roster, [action.from]: toCard, [action.to]: fromCard }
    return { ...state, rosters: { ...state.rosters, [action.playerId]: moved } }
  }

  // The host's AI scouting report, judged once between draft and tip-off.
  if (action.type === 'SET_JUDGE') {
    if (state.phase !== 'preview' || state.judge !== null) return state
    return { ...state, judge: action.judgment }
  }

  if (action.type === 'BEGIN_COMPETITION') {
    if (state.phase !== 'preview') return state
    if (state.config.format === 'chase') {
      const myId = state.entries.find((e) => !e.isFiller)!.id
      const opponents = state.entries.filter((e) => e.isFiller).map((e) => e.id)
      const season = initSeason(state.entries.map((e) => e.id), 0)
      return { ...state, phase: 'season', season: { ...season, schedule: chaseSchedule(myId, opponents) } }
    }
    if (state.config.format === 'season') {
      const teamIds = state.entries.map((e) => e.id)
      return {
        ...state,
        phase: 'season',
        season: initSeason(teamIds, hashSeed(`${state.config.seed}:schedule`)),
      }
    }
    return startPlayoffs(state, powerSeeds(state))
  }

  if (action.type === 'SIM_NEXT') {
    if (state.phase === 'season') return simSeasonStep(state)
    if (state.phase === 'playoffs') return simPlayoffStep(state)
    return state
  }

  return state
}

// ------------------------------------------------------- convenience API

export function allCards(state: MatchState): Card[] {
  return Object.values(state.rosters).flatMap((roster) => rosterCards(roster))
}
