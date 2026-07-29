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

// ---------------------------------------------------------------- config

export type DraftMode = 'tiers' | 'franchise'

export interface DraftPlayer {
  id: string
  name: string
  isCpu: boolean
}

export const ROUNDS = 8
export const REROLLS_PER_PLAYER = 2
export const OFFER_SIZE = 4

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

export interface FranchiseWindow {
  abbrev: string
  startSeason: number
  endSeason: number
}

export interface Offer {
  cards: Card[]
  tier: Tier | null
  franchise: FranchiseWindow | null
  forPlayerId: string
  round: number
}

export interface TeamState {
  playerId: string
  roster: Roster
  rerollsLeft: number
}

export interface DraftState {
  mode: DraftMode
  players: DraftPlayer[]
  teams: Record<string, TeamState>
  order: string[] // snake pick sequence, ROUNDS * players long
  pickIndex: number
  offer: Offer | null
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

export function initDraft(mode: DraftMode, players: DraftPlayer[], seed: number, ctx: DraftCtx): DraftState {
  const state: DraftState = {
    mode,
    players,
    teams: Object.fromEntries(
      players.map((p) => [p.id, { playerId: p.id, roster: emptyRoster(), rerollsLeft: REROLLS_PER_PLAYER }]),
    ),
    order: snakeOrder(
      players.map((p) => p.id),
      ROUNDS,
    ),
    pickIndex: 0,
    offer: null,
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

  return { cards, tier, franchise: null, forPlayerId: playerId, round }
}

const FRANCHISE_WINDOW = 2
const FRANCHISE_OFFER_MAX = 12
const FRANCHISE_MIN_CARDS = 6

function franchiseOffer(state: DraftState, ctx: DraftCtx, rng: Rng, playerId: string, round: number): Offer {
  const roster = state.teams[playerId].roster
  const constrain = mustFillStarter(state, playerId)
  const pool = availableCards(state, ctx)

  // Spin an (era, franchise) with enough qualified cards left.
  for (let attempt = 0; attempt < 60; attempt++) {
    const anchor = pool[Math.floor(rng() * pool.length)]
    const abbrev = anchor.teams[Math.floor(rng() * anchor.teams.length)]
    const start = anchor.season - FRANCHISE_WINDOW
    const end = anchor.season + FRANCHISE_WINDOW
    let cards = pool.filter((c) => c.season >= start && c.season <= end && c.teams.includes(abbrev))
    if (constrain) {
      const fillers = cards.filter((c) => fillsOpenStarter(c, roster))
      if (fillers.length === 0) continue
      cards = fillers.length >= 3 ? fillers : cards
      if (!cards.some((c) => fillsOpenStarter(c, roster))) continue
    }
    if (cards.length >= FRANCHISE_MIN_CARDS) {
      const top = [...cards].sort((a, b) => b.ovr - a.ovr).slice(0, FRANCHISE_OFFER_MAX)
      return { cards: top, tier: null, franchise: { abbrev, startSeason: start, endSeason: end }, forPlayerId: playerId, round }
    }
  }
  // Pathological fallback: behave like a tier offer so the draft never stalls.
  return tierOffer(state, ctx, rng, playerId, round)
}

function generateOffer(state: DraftState, ctx: DraftCtx): Offer {
  const playerId = state.order[state.pickIndex]
  const round = currentRound(state)
  const rng = mulberry32(hashSeed(`${state.seed}:${state.spinCount}`))
  return state.mode === 'franchise'
    ? franchiseOffer(state, ctx, rng, playerId, round)
    : tierOffer(state, ctx, rng, playerId, round)
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

  if (state.done || !state.offer) return state
  const turnPlayerId = currentPlayerId(state)
  if (action.playerId !== turnPlayerId) return state

  if (action.type === 'REROLL') {
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
    const team = state.teams[action.playerId]
    const forceStarter = mustFillStarter(state, action.playerId)
    const slot = autoPlace(team.roster, card, forceStarter)
    const roster: Roster = { ...team.roster, [slot]: card }

    const pickIndex = state.pickIndex + 1
    const done = pickIndex >= state.order.length
    const next: DraftState = {
      ...state,
      teams: { ...state.teams, [action.playerId]: { ...team, roster } },
      draftedPids: [...state.draftedPids, card.pid],
      pickIndex,
      spinCount: state.spinCount + 1,
      offer: null,
      done,
    }
    return done ? next : { ...next, offer: generateOffer(next, ctx) }
  }

  return state
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

// Runs every consecutive CPU turn (used by solo mode and the online host).
export function advanceCpuTurns(state: DraftState, ctx: DraftCtx): DraftState {
  let current = state
  for (;;) {
    const playerId = currentPlayerId(current)
    if (!playerId) return current
    const player = current.players.find((p) => p.id === playerId)
    if (!player?.isCpu) return current
    current = applyAction(current, cpuChoose(current), ctx)
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
