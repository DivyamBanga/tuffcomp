import type { Card, Tier } from '../types'
import {
  BENCH_SLOTS,
  STARTER_SLOTS,
  canPlaySlot,
  emptyRoster,
  slotCompat,
  type Roster,
  type SlotId,
} from '../engine/lineup'
import { hashSeed, mulberry32, shuffle, type Rng } from '../engine/prng'
import { pickThemeRounds, resolveTypedPick, themeById } from './themes'

// ---------------------------------------------------------------- config

export type DraftMode = 'tiers' | 'themes'

// Theme mode pick style (lobby-wide, so the competition stays fair):
// 'type' - name your player blind from memory; 'grid' - choose from a board.
export type PickInput = 'type' | 'grid'

export interface DraftPlayer {
  id: string
  name: string
  isCpu: boolean
}

export const ROUNDS = 8
export const REROLLS_PER_PLAYER = 2
export const OFFER_SIZE = 4
export const STRIKES_PER_PLAYER = 3
const THEME_OFFER_SIZE = 12

// Every player gets the same round ladder, so teams stay even: a guaranteed
// star early, solid starters in the middle, and a jackpot WILDCARD finish
// where any tier - GOAT included - can drop.
const ROUND_TIER_WEIGHTS: Record<number, [Tier, number][]> = {
  1: [
    ['GOAT', 0.25],
    ['SUPERSTAR', 0.75],
  ],
  2: [
    ['SUPERSTAR', 0.3],
    ['ALLSTAR', 0.7],
  ],
  3: [['ALLSTAR', 1]],
  4: [['STARTER', 1]],
  5: [['STARTER', 1]],
  6: [['ROTATION', 1]],
  7: [['ROTATION', 1]],
  8: [
    ['GOAT', 0.2],
    ['SUPERSTAR', 0.2],
    ['ALLSTAR', 0.2],
    ['STARTER', 0.2],
    ['ROTATION', 0.2],
  ],
}

// ----------------------------------------------------------------- state

export interface Offer {
  cards: Card[]
  tier: Tier | null
  forPlayerId: string
  round: number
  // Theme mode only: the theme couldn't fill this drafter's forced starter
  // needs, so the board opened up beyond the theme.
  themeFallback?: boolean
}

export interface TeamState {
  playerId: string
  roster: Roster
  rerollsLeft: number
  strikesLeft: number
}

export type TypeOutcome = 'no-match' | 'off-theme' | 'taken' | 'cant-fit'

// Feedback from the last typed attempt - broadcast so everyone enjoys the
// whiffs ("Jordan was never a Laker").
export interface TypeFeedback {
  playerId: string
  query: string
  outcome: TypeOutcome
  matchedName: string | null
  attempt: number
}

export interface PickSummary {
  playerId: string
  name: string
  season: number
  ovr: number
  tier: Tier
}

export interface DraftState {
  mode: DraftMode
  input: PickInput
  players: DraftPlayer[]
  teams: Record<string, TeamState>
  order: string[] // snake pick sequence, ROUNDS * players long
  pickIndex: number
  offer: Offer | null
  themeRounds: string[] // theme ids, one per round (themes mode only)
  lastType: TypeFeedback | null
  lastPick: PickSummary | null
  draftedPids: string[] // one real person per league, regardless of season
  seed: number
  spinCount: number
  done: boolean
}

export interface DraftCtx {
  pool: Card[]
}

export type DraftAction =
  | { type: 'TAKE'; playerId: string; cardId: string }
  | { type: 'TYPE_PICK'; playerId: string; query: string }
  | { type: 'REROLL'; playerId: string }
  | { type: 'MOVE'; playerId: string; from: SlotId; to: SlotId }

// ------------------------------------------------------------------ init

function snakeOrder(playerIds: string[], rounds: number): string[] {
  const order: string[] = []
  for (let r = 0; r < rounds; r++) {
    const row = r % 2 === 0 ? playerIds : [...playerIds].reverse()
    order.push(...row)
  }
  return order
}

export function initDraft(
  mode: DraftMode,
  players: DraftPlayer[],
  seed: number,
  ctx: DraftCtx,
  input: PickInput = 'type',
): DraftState {
  const state: DraftState = {
    mode,
    input,
    players,
    teams: Object.fromEntries(
      players.map((p) => [
        p.id,
        { playerId: p.id, roster: emptyRoster(), rerollsLeft: REROLLS_PER_PLAYER, strikesLeft: STRIKES_PER_PLAYER },
      ]),
    ),
    order: snakeOrder(
      players.map((p) => p.id),
      ROUNDS,
    ),
    pickIndex: 0,
    offer: null,
    themeRounds: mode === 'themes' ? pickThemeRounds(ctx.pool, players.length, seed, ROUNDS) : [],
    lastType: null,
    lastPick: null,
    draftedPids: [],
    seed,
    spinCount: 0,
    done: false,
  }
  return { ...state, offer: generateOffer(state, ctx) }
}

// -------------------------------------------------------------- selectors

export function currentPlayerId(state: DraftState): string | null {
  return state.done ? null : state.order[state.pickIndex]
}

export function currentRound(state: DraftState): number {
  return Math.floor(state.pickIndex / state.players.length) + 1
}

function openStarterSlots(roster: Roster): SlotId[] {
  return STARTER_SLOTS.filter((slot) => roster[slot] === null)
}

function remainingPicksFor(state: DraftState, playerId: string): number {
  let count = 0
  for (let i = state.pickIndex; i < state.order.length; i++) {
    if (state.order[i] === playerId) count++
  }
  return count
}

// ------------------------------------------------------------ offer logic

function pickTier(weights: [Tier, number][], rng: Rng): Tier {
  const roll = rng()
  let cumulative = 0
  for (const [tier, weight] of weights) {
    cumulative += weight
    if (roll < cumulative) return tier
  }
  return weights[weights.length - 1][0]
}

function availableCards(state: DraftState, ctx: DraftCtx): Card[] {
  const drafted = new Set(state.draftedPids)
  return ctx.pool.filter((c) => !drafted.has(c.pid))
}

// When a drafter's open starter slots equal their remaining picks, every
// offered card must be able to fill one of those slots - otherwise a team
// could finish unable to field five starters.
function mustFillStarter(state: DraftState, playerId: string): boolean {
  const roster = state.teams[playerId].roster
  return openStarterSlots(roster).length >= remainingPicksFor(state, playerId)
}

function fillsOpenStarter(card: Card, roster: Roster): boolean {
  return openStarterSlots(roster).some((slot) => canPlaySlot(card, slot))
}

function tierOffer(state: DraftState, ctx: DraftCtx, rng: Rng, playerId: string, round: number): Offer {
  const roster = state.teams[playerId].roster
  const constrain = mustFillStarter(state, playerId)
  const pool = availableCards(state, ctx).filter((c) => !constrain || fillsOpenStarter(c, roster))

  const weights = ROUND_TIER_WEIGHTS[round]
  let tier = pickTier(weights, rng)
  let tierPool = pool.filter((c) => c.tier === tier)
  // If the drawn tier ran dry under constraints, fall through the ladder.
  if (tierPool.length < OFFER_SIZE) {
    const fallbackOrder: Tier[] = ['SUPERSTAR', 'ALLSTAR', 'STARTER', 'ROTATION', 'GOAT']
    for (const fallback of fallbackOrder) {
      tierPool = pool.filter((c) => c.tier === fallback)
      if (tierPool.length >= OFFER_SIZE) {
        tier = fallback
        break
      }
    }
    if (tierPool.length < OFFER_SIZE) tierPool = pool
  }

  // Positional need bias: aim for at least half the offer filling an open
  // starter slot so late rounds don't strand a roster hole.
  const shuffled = shuffle(rng, tierPool)
  const needFillers = shuffled.filter((c) => fillsOpenStarter(c, roster))
  const cards: Card[] = []
  const wantNeed = Math.min(needFillers.length, Math.ceil(OFFER_SIZE / 2))
  for (const c of needFillers) {
    if (cards.length >= wantNeed) break
    cards.push(c)
  }
  for (const c of shuffled) {
    if (cards.length >= OFFER_SIZE) break
    if (!cards.some((x) => x.id === c.id)) cards.push(c)
  }

  return { cards, tier, forPlayerId: playerId, round }
}

// Deterministic season ranking: best overall, then the later year.
function betterSeason(a: Card, b: Card): boolean {
  return a.ovr !== b.ovr ? a.ovr > b.ovr : a.season !== b.season ? a.season > b.season : a.id < b.id
}

function bestSeasonPerPerson(cards: Card[]): Card[] {
  const byPid = new Map<string, Card>()
  for (const c of cards) {
    const cur = byPid.get(c.pid)
    if (!cur || betterSeason(c, cur)) byPid.set(c.pid, c)
  }
  return [...byPid.values()]
}

// Cards the current drafter could legally use this pick under the round's
// theme (empty when the theme has dried up for their needs).
function themeUsableCards(state: DraftState, ctx: DraftCtx, playerId: string, round: number): Card[] {
  const theme = themeById(state.themeRounds[round - 1])
  const roster = state.teams[playerId].roster
  const constrain = mustFillStarter(state, playerId)
  const eligible = availableCards(state, ctx).filter(theme.test)
  return constrain ? eligible.filter((c) => fillsOpenStarter(c, roster)) : eligible
}

// Theme mode board. Returns null when the drafter should be typing instead:
// hard mode with strikes still in hand and a live theme. The board appears
// for grid lobbies, drafters out of strikes, and dried-up themes (fallback
// opens past the theme so nobody softlocks).
function themeOffer(state: DraftState, ctx: DraftCtx, playerId: string, round: number): Offer | null {
  const team = state.teams[playerId]
  const usable = themeUsableCards(state, ctx, playerId, round)
  const fallback = usable.length === 0
  const gridNeeded = state.input === 'grid' || team.strikesLeft <= 0 || fallback
  if (!gridNeeded) return null

  let pool = usable
  if (fallback) {
    const available = availableCards(state, ctx)
    const constrain = mustFillStarter(state, playerId)
    pool = constrain ? available.filter((c) => fillsOpenStarter(c, team.roster)) : available
  }

  const cards = bestSeasonPerPerson(pool)
    .sort((a, b) => (betterSeason(a, b) ? -1 : 1))
    .slice(0, THEME_OFFER_SIZE)
  return { cards, tier: null, forPlayerId: playerId, round, ...(fallback ? { themeFallback: true } : {}) }
}

function generateOffer(state: DraftState, ctx: DraftCtx): Offer | null {
  const playerId = state.order[state.pickIndex]
  const round = currentRound(state)
  if (state.mode === 'themes') return themeOffer(state, ctx, playerId, round)
  const rng = mulberry32(hashSeed(`${state.seed}:${state.spinCount}`))
  return tierOffer(state, ctx, rng, playerId, round)
}

// ------------------------------------------------------------- placement

// Where a taken card lands. Natural open starter slot first. After that,
// when starters must be filled (open starters == remaining picks) prefer a
// stretch starter; otherwise park on the bench and keep the starter slot
// open for a natural fit later. Players can rearrange freely via MOVE.
export function autoPlace(roster: Roster, card: Card, forceStarter: boolean): SlotId {
  const open = openStarterSlots(roster)
  const naturals = open.filter((slot) => slotCompat(card, slot) === 1)
  if (naturals.length > 0) return naturals[0]

  const stretches = open.filter((slot) => canPlaySlot(card, slot))
  const bench = BENCH_SLOTS.filter((slot) => roster[slot] === null)
  const preference = forceStarter ? [...stretches, ...bench] : [...bench, ...stretches]
  if (preference.length > 0) return preference[0]
  throw new Error('no open slot')
}

// --------------------------------------------------------------- reducer

export function applyAction(state: DraftState, action: DraftAction, ctx: DraftCtx): DraftState {
  if (action.type === 'MOVE') {
    const team = state.teams[action.playerId]
    if (!team) return state
    const fromCard = team.roster[action.from]
    const toCard = team.roster[action.to]
    if (!fromCard) return state
    if (!canPlaySlot(fromCard, action.to)) return state
    if (toCard && !canPlaySlot(toCard, action.from)) return state
    const roster: Roster = { ...team.roster, [action.from]: toCard, [action.to]: fromCard }
    return { ...state, teams: { ...state.teams, [action.playerId]: { ...team, roster } } }
  }

  if (state.done) return state
  const turnPlayerId = currentPlayerId(state)
  if (action.playerId !== turnPlayerId) return state

  if (action.type === 'TYPE_PICK') {
    if (state.mode !== 'themes' || state.offer !== null) return state
    const round = currentRound(state)
    const theme = themeById(state.themeRounds[round - 1])
    const team = state.teams[action.playerId]
    const attempt = (state.lastType?.attempt ?? 0) + 1

    // A whiff: record feedback, maybe burn a strike, and open the board
    // once the drafter is out of strikes.
    const miss = (outcome: TypeOutcome, matchedName: string | null, strike: boolean): DraftState => {
      const strikesLeft = strike ? team.strikesLeft - 1 : team.strikesLeft
      const next: DraftState = {
        ...state,
        teams: { ...state.teams, [action.playerId]: { ...team, strikesLeft } },
        lastType: { playerId: action.playerId, query: action.query, outcome, matchedName, attempt },
      }
      return strikesLeft <= 0 ? { ...next, offer: generateOffer(next, ctx) } : next
    }

    const resolved = resolveTypedPick(ctx.pool, action.query)
    if (!resolved) return miss('no-match', null, false)
    if (state.draftedPids.includes(resolved.pid)) return miss('taken', resolved.name, true)
    const eligible = ctx.pool.filter((c) => c.pid === resolved.pid && theme.test(c))
    if (eligible.length === 0) return miss('off-theme', resolved.name, true)
    const forceStarter = mustFillStarter(state, action.playerId)
    const usable = forceStarter ? eligible.filter((c) => fillsOpenStarter(c, team.roster)) : eligible
    if (usable.length === 0) return miss('cant-fit', resolved.name, true)

    // The pick lands as that player's best season passing the theme.
    const card = usable.reduce((a, b) => (betterSeason(b, a) ? b : a))
    return commitPick(state, action.playerId, card, ctx)
  }

  if (!state.offer) return state

  if (action.type === 'REROLL') {
    if (state.mode === 'themes') return state
    const team = state.teams[action.playerId]
    if (team.rerollsLeft <= 0) return state
    const next: DraftState = {
      ...state,
      teams: { ...state.teams, [action.playerId]: { ...team, rerollsLeft: team.rerollsLeft - 1 } },
      spinCount: state.spinCount + 1,
    }
    return { ...next, offer: generateOffer(next, ctx) }
  }

  if (action.type === 'TAKE') {
    const card = state.offer.cards.find((c) => c.id === action.cardId)
    if (!card) return state
    return commitPick(state, action.playerId, card, ctx)
  }

  return state
}

// Shared landing for every successful pick, typed or tapped.
function commitPick(state: DraftState, playerId: string, card: Card, ctx: DraftCtx): DraftState {
  const team = state.teams[playerId]
  const forceStarter = mustFillStarter(state, playerId)
  const slot = autoPlace(team.roster, card, forceStarter)
  const roster: Roster = { ...team.roster, [slot]: card }

  const pickIndex = state.pickIndex + 1
  const done = pickIndex >= state.order.length
  const next: DraftState = {
    ...state,
    teams: { ...state.teams, [playerId]: { ...team, roster } },
    draftedPids: [...state.draftedPids, card.pid],
    pickIndex,
    spinCount: state.spinCount + 1,
    offer: null,
    lastType: null,
    lastPick: { playerId, name: card.name, season: card.season, ovr: card.ovr, tier: card.tier },
    done,
  }
  return done ? next : { ...next, offer: generateOffer(next, ctx) }
}

// ------------------------------------------------------------------- CPU

// Take the best card, preferring ones that fill an open starter slot
// naturally; tiny preference for lower usage to avoid ball-hog stacks.
export function cpuChoose(state: DraftState): DraftAction {
  const playerId = currentPlayerId(state)!
  const offer = state.offer!
  const roster = state.teams[playerId].roster
  const scored = offer.cards.map((card) => {
    const naturalFill = openStarterSlots(roster).some((slot) => slotCompat(card, slot) === 1)
    const anyFill = fillsOpenStarter(card, roster)
    return { card, score: card.ovr + (naturalFill ? 6 : anyFill ? 3 : 0) - card.usg * 0.08 }
  })
  scored.sort((a, b) => b.score - a.score)
  return { type: 'TAKE', playerId, cardId: scored[0].card.id }
}

// Theme mode CPU: with a board up, tap it like anyone else; otherwise
// "type" a name it knows fits. Only names that resolve round-trip to the
// intended person are considered, so the CPU never burns a strike.
function cpuChooseTheme(state: DraftState, ctx: DraftCtx): DraftAction {
  const playerId = currentPlayerId(state)!
  if (state.offer) return cpuChoose(state)
  const roster = state.teams[playerId].roster
  const raw = bestSeasonPerPerson(themeUsableCards(state, ctx, playerId, currentRound(state)))
  const roundTrips = raw.filter((card) => resolveTypedPick(ctx.pool, card.name)?.pid === card.pid)
  const usable = roundTrips.length > 0 ? roundTrips : raw
  const scored = usable.map((card) => {
    const naturalFill = openStarterSlots(roster).some((slot) => slotCompat(card, slot) === 1)
    const anyFill = fillsOpenStarter(card, roster)
    return { card, score: card.ovr + (naturalFill ? 6 : anyFill ? 3 : 0) - card.usg * 0.08 }
  })
  scored.sort((a, b) => b.score - a.score)
  return { type: 'TYPE_PICK', playerId, query: scored[0].card.name }
}

// Runs every consecutive CPU turn (used by solo mode and the online host).
export function advanceCpuTurns(state: DraftState, ctx: DraftCtx): DraftState {
  let current = state
  for (;;) {
    const playerId = currentPlayerId(current)
    if (!playerId) return current
    const player = current.players.find((p) => p.id === playerId)
    if (!player?.isCpu) return current
    const action = current.mode === 'themes' ? cpuChooseTheme(current, ctx) : cpuChoose(current)
    const next = applyAction(current, action, ctx)
    if (next === current) return current // safety: never loop in place
    current = next
  }
}

// Instantly drafts a full legal team for a CPU filler franchise outside the
// human draft (used to pad the league before a season).
export function draftFillerTeam(state: DraftState, ctx: DraftCtx, teamSeed: number): { roster: Roster; draftedPids: string[] } {
  const rng = mulberry32(teamSeed)
  const drafted = new Set(state.draftedPids)
  const roster = emptyRoster()
  const newPids: string[] = []

  for (let round = 1; round <= ROUNDS; round++) {
    const openStarters = openStarterSlots(roster)
    const picksLeft = ROUNDS - round + 1
    const constrain = openStarters.length >= picksLeft
    const weights = ROUND_TIER_WEIGHTS[round]
    const tier = pickTier(weights, rng)
    let pool = ctx.pool.filter((c) => !drafted.has(c.pid) && !newPids.includes(c.pid))
    if (constrain) pool = pool.filter((c) => fillsOpenStarter(c, roster))
    let tierPool = pool.filter((c) => c.tier === tier)
    if (tierPool.length === 0) tierPool = pool
    const card = tierPool[Math.floor(rng() * tierPool.length)]
    const slot = autoPlace(roster, card, constrain)
    roster[slot] = card
    newPids.push(card.pid)
  }

  return { roster, draftedPids: newPids }
}
