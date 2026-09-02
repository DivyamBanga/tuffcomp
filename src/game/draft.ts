import type { Card, Tier } from '../types'
import {
  BENCH_SLOTS,
  STARTER_SLOTS,
  canPlaySlot,
  emptyRoster,
  roleFit,
  slotCompat,
  type Roster,
  type SlotId,
} from '../engine/lineup'
import { mulberry32 } from '../engine/prng'
import { pickDraftTheme, resolveTypedPick, themeById, themeNeedsPositionless } from './themes'

// ---------------------------------------------------------------- config

// Four draft modes. 'themes' is the flagship: a single theme deals at
// the start and everyone answers the same question by TYPING names from
// memory - unlimited guesses, no strikes, no easy board. 'budget',
// 'auction', and 'mystery' are the 5-man party modes (see party.ts).
export type DraftMode = 'themes' | 'budget' | 'auction' | 'mystery'

export interface DraftPlayer {
  id: string
  name: string
  isCpu: boolean
}

export const ROUNDS = 8
const THEME_OFFER_SIZE = 12
const WHIFF_LOG_LIMIT = 24

// ----------------------------------------------------------------- state

export interface Offer {
  cards: Card[]
  forPlayerId: string
  round: number
  // The theme couldn't fill this drafter's forced starter needs, so the
  // board opened up beyond the theme (positional themes only - a
  // positionless draft never needs it).
  themeFallback?: boolean
}

export interface TeamState {
  playerId: string
  roster: Roster
}

export type TypeOutcome = 'no-match' | 'off-theme' | 'taken' | 'cant-fit'

// Feedback from a typed attempt - broadcast so everyone enjoys the whiffs
// ("Jordan was never a Laker").
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
  players: DraftPlayer[]
  teams: Record<string, TeamState>
  order: string[] // snake pick sequence, ROUNDS * players long
  pickIndex: number
  offer: Offer | null
  theme: string | null // the draft's one theme id
  // Position-locked themes (7-FOOTERS...) can't field legal fives, so the
  // whole draft plays positionless: anyone in any slot, placed by skills.
  positionless: boolean
  lastType: TypeFeedback | null
  // The draft's whiff record, oldest first, capped - the comedy ledger.
  whiffs: TypeFeedback[]
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
  | { type: 'TAKE'; playerId: string; cardId: string; slot?: SlotId }
  | { type: 'TYPE_PICK'; playerId: string; query: string; slot?: SlotId }
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
  chosenTheme?: string | null,
): DraftState {
  const theme = pickDraftTheme(ctx.pool, players.length, seed, ROUNDS, chosenTheme)
  const state: DraftState = {
    mode,
    players,
    teams: Object.fromEntries(players.map((p) => [p.id, { playerId: p.id, roster: emptyRoster() }])),
    order: snakeOrder(
      players.map((p) => p.id),
      ROUNDS,
    ),
    pickIndex: 0,
    offer: null,
    theme,
    positionless: themeNeedsPositionless(themeById(theme), ctx.pool, players.length),
    lastType: null,
    whiffs: [],
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

// Slot legality for this draft: positionless themes let anyone play
// anywhere; positional themes enforce real positions.
function canFill(state: DraftState, card: Card, slot: SlotId): boolean {
  return state.positionless || canPlaySlot(card, slot)
}

// ------------------------------------------------------------ offer logic

function availableCards(state: DraftState, ctx: DraftCtx): Card[] {
  const drafted = new Set(state.draftedPids)
  return ctx.pool.filter((c) => !drafted.has(c.pid))
}

// When a drafter's open starter slots equal their remaining picks, every
// pick must be able to fill one of those slots - otherwise a team could
// finish unable to field five starters.
function mustFillStarter(state: DraftState, playerId: string): boolean {
  const roster = state.teams[playerId].roster
  return openStarterSlots(roster).length >= remainingPicksFor(state, playerId)
}

function fillsOpenStarter(state: DraftState, card: Card, roster: Roster): boolean {
  return openStarterSlots(roster).some((slot) => canFill(state, card, slot))
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

// Cards the current drafter could legally use this pick under the draft's
// theme (empty when the theme has dried up for their needs).
function themeUsableCards(state: DraftState, ctx: DraftCtx, playerId: string): Card[] {
  const theme = themeById(state.theme!)
  const roster = state.teams[playerId].roster
  const constrain = mustFillStarter(state, playerId)
  const eligible = availableCards(state, ctx).filter(theme.test)
  return constrain ? eligible.filter((c) => fillsOpenStarter(state, c, roster)) : eligible
}

// The board. Null while the drafter should be typing - which is almost
// always. It appears only when a positional theme has genuinely dried up
// for this drafter's forced starter needs, opening past the theme so
// nobody softlocks.
function themeOffer(state: DraftState, ctx: DraftCtx, playerId: string, round: number): Offer | null {
  const team = state.teams[playerId]
  const usable = themeUsableCards(state, ctx, playerId)
  if (usable.length > 0) return null

  const available = availableCards(state, ctx)
  const constrain = mustFillStarter(state, playerId)
  const pool = constrain ? available.filter((c) => fillsOpenStarter(state, c, team.roster)) : available

  const cards = bestSeasonPerPerson(pool)
    .sort((a, b) => (betterSeason(a, b) ? -1 : 1))
    .slice(0, THEME_OFFER_SIZE)
  return { cards, forPlayerId: playerId, round, themeFallback: true }
}

function generateOffer(state: DraftState, ctx: DraftCtx): Offer | null {
  const playerId = state.order[state.pickIndex]
  return themeOffer(state, ctx, playerId, currentRound(state))
}

// ------------------------------------------------------------- placement

// Where a taken card lands when no slot was chosen. Positional drafts:
// natural open starter slot first, stretch when starters must fill,
// otherwise the bench. Positionless drafts: the open starter slot whose
// ROLE best matches the card's skills - the best passer runs point.
export function autoPlace(roster: Roster, card: Card, forceStarter: boolean, positionless = false): SlotId {
  const open = openStarterSlots(roster)

  if (positionless) {
    if (open.length > 0) {
      return open.reduce((best, slot) => (roleFit(card, slot) > roleFit(card, best) ? slot : best))
    }
    const bench = BENCH_SLOTS.filter((slot) => roster[slot] === null)
    if (bench.length > 0) return bench[0]
    throw new Error('no open slot')
  }

  const naturals = open.filter((slot) => slotCompat(card, slot) === 1)
  if (naturals.length > 0) return naturals[0]

  const stretches = open.filter((slot) => canPlaySlot(card, slot))
  const bench = BENCH_SLOTS.filter((slot) => roster[slot] === null)
  const preference = forceStarter ? [...stretches, ...bench] : [...bench, ...stretches]
  if (preference.length > 0) return preference[0]
  throw new Error('no open slot')
}

// A drafter-chosen slot wins when it is open and legal (and doesn't break
// the must-field-five guarantee); anything else falls back to autoPlace.
function placeSlot(state: DraftState, playerId: string, card: Card, chosen: SlotId | undefined): SlotId {
  const roster = state.teams[playerId].roster
  const forceStarter = mustFillStarter(state, playerId)
  if (
    chosen &&
    roster[chosen] === null &&
    canFill(state, card, chosen) &&
    !(forceStarter && (BENCH_SLOTS as readonly string[]).includes(chosen))
  ) {
    return chosen
  }
  return autoPlace(roster, card, forceStarter, state.positionless)
}

// --------------------------------------------------------------- reducer

export function applyAction(state: DraftState, action: DraftAction, ctx: DraftCtx): DraftState {
  if (action.type === 'MOVE') {
    const team = state.teams[action.playerId]
    if (!team) return state
    const fromCard = team.roster[action.from]
    const toCard = team.roster[action.to]
    if (!fromCard) return state
    if (!canFill(state, fromCard, action.to)) return state
    if (toCard && !canFill(state, toCard, action.from)) return state
    const roster: Roster = { ...team.roster, [action.from]: toCard, [action.to]: fromCard }
    return { ...state, teams: { ...state.teams, [action.playerId]: { ...team, roster } } }
  }

  if (state.done) return state
  const turnPlayerId = currentPlayerId(state)
  if (action.playerId !== turnPlayerId) return state

  if (action.type === 'TYPE_PICK') {
    if (state.offer !== null) return state
    const theme = themeById(state.theme!)
    const team = state.teams[action.playerId]
    const attempt = (state.lastType?.attempt ?? 0) + 1

    // A whiff: feedback plus a line in the draft's whiff ledger. Guesses
    // are unlimited - the only cost is public embarrassment.
    const miss = (outcome: TypeOutcome, matchedName: string | null): DraftState => {
      const feedback: TypeFeedback = { playerId: action.playerId, query: action.query, outcome, matchedName, attempt }
      return {
        ...state,
        lastType: feedback,
        whiffs: [...state.whiffs, feedback].slice(-WHIFF_LOG_LIMIT),
      }
    }

    const resolved = resolveTypedPick(ctx.pool, action.query)
    if (!resolved) return miss('no-match', null)
    if (state.draftedPids.includes(resolved.pid)) return miss('taken', resolved.name)
    const eligible = ctx.pool.filter((c) => c.pid === resolved.pid && theme.test(c))
    if (eligible.length === 0) return miss('off-theme', resolved.name)
    const forceStarter = mustFillStarter(state, action.playerId)
    const usable = forceStarter ? eligible.filter((c) => fillsOpenStarter(state, c, team.roster)) : eligible
    if (usable.length === 0) return miss('cant-fit', resolved.name)

    // The pick lands as that player's best season passing the theme.
    const card = usable.reduce((a, b) => (betterSeason(b, a) ? b : a))
    return commitPick(state, action.playerId, card, ctx, action.slot)
  }

  if (!state.offer) return state

  if (action.type === 'TAKE') {
    const card = state.offer.cards.find((c) => c.id === action.cardId)
    if (!card) return state
    return commitPick(state, action.playerId, card, ctx, action.slot)
  }

  return state
}

// Shared landing for every successful pick, typed or tapped.
function commitPick(state: DraftState, playerId: string, card: Card, ctx: DraftCtx, slot?: SlotId): DraftState {
  const team = state.teams[playerId]
  const landing = placeSlot(state, playerId, card, slot)
  const roster: Roster = { ...team.roster, [landing]: card }

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
    const naturalFill =
      !state.positionless && openStarterSlots(roster).some((slot) => slotCompat(card, slot) === 1)
    const anyFill = fillsOpenStarter(state, card, roster)
    return { card, score: card.ovr + (naturalFill ? 6 : anyFill ? 3 : 0) - card.usg * 0.08 }
  })
  scored.sort((a, b) => b.score - a.score)
  return { type: 'TAKE', playerId, cardId: scored[0].card.id }
}

// With a fallback board up, the CPU taps it like anyone else; otherwise it
// "types" a name it knows fits. Only names that resolve round-trip to the
// intended person are considered, so the CPU never whiffs.
export function cpuChooseTheme(state: DraftState, ctx: DraftCtx): DraftAction {
  const playerId = currentPlayerId(state)!
  if (state.offer) return cpuChoose(state)
  const roster = state.teams[playerId].roster
  const raw = bestSeasonPerPerson(themeUsableCards(state, ctx, playerId))
  const roundTrips = raw.filter((card) => resolveTypedPick(ctx.pool, card.name)?.pid === card.pid)
  const usable = roundTrips.length > 0 ? roundTrips : raw
  const scored = usable.map((card) => {
    const naturalFill =
      !state.positionless && openStarterSlots(roster).some((slot) => slotCompat(card, slot) === 1)
    const anyFill = fillsOpenStarter(state, card, roster)
    return { card, score: card.ovr + (naturalFill ? 6 : anyFill ? 3 : 0) - card.usg * 0.08 }
  })
  scored.sort((a, b) => b.score - a.score)
  return { type: 'TYPE_PICK', playerId, query: scored[0].card.name }
}

// Runs every consecutive CPU turn (used by the online host).
export function advanceCpuTurns(state: DraftState, ctx: DraftCtx): DraftState {
  let current = state
  for (;;) {
    const playerId = currentPlayerId(current)
    if (!playerId) return current
    const player = current.players.find((p) => p.id === playerId)
    if (!player?.isCpu) return current
    const next = applyAction(current, cpuChooseTheme(current, ctx), ctx)
    if (next === current) return current // safety: never loop in place
    current = next
  }
}

// Instantly drafts a full legal team from the leftover pool (used to
// generate opposition: league fillers and chase-mode opponents). Drafts
// toward `targetOvr`, so opposition strength is a real dial instead of an
// accident of pool depth - the 82-0 slate is calibrated with this.
export function draftFillerTeam(
  drafted: Set<string>,
  ctx: DraftCtx,
  teamSeed: number,
  targetOvr = 85,
): { roster: Roster; draftedPids: string[] } {
  const rng = mulberry32(teamSeed)
  const roster = emptyRoster()
  const newPids: string[] = []

  const fillsOpen = (card: Card) => openStarterSlots(roster).some((slot) => canPlaySlot(card, slot))

  for (let round = 1; round <= ROUNDS; round++) {
    const openStarters = openStarterSlots(roster)
    const picksLeft = ROUNDS - round + 1
    const constrain = openStarters.length >= picksLeft
    let pool = ctx.pool.filter((c) => !drafted.has(c.pid) && !newPids.includes(c.pid))
    if (constrain) pool = pool.filter(fillsOpen)
    const people = bestSeasonPerPerson(pool)
    // Everyone within a tight band of the target; widen until enough
    // candidates exist so late rounds and thin pools never strand.
    let candidates: Card[] = []
    for (let window = 2; candidates.length < 8 && window <= 40; window += 2) {
      candidates = people.filter((c) => Math.abs(c.ovr - targetOvr) <= window)
    }
    if (candidates.length === 0) candidates = people
    const card = candidates[Math.floor(rng() * candidates.length)]
    const slot = autoPlace(roster, card, constrain)
    roster[slot] = card
    newPids.push(card.pid)
  }

  return { roster, draftedPids: newPids }
}
