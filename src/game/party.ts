import type { Card } from '../types'
import {
  STARTER_SLOTS,
  canPlaySlot,
  emptyRoster,
  roleFit,
  slotCompat,
  type Roster,
  type SlotId,
} from '../engine/lineup'
import { hashSeed, mulberry32, shuffle } from '../engine/prng'
import { pickDraftTheme, themeById, themeNeedsPositionless } from './themes'
import type { DraftCtx, DraftPlayer } from './draft'

// ------------------------------------------------------------ party modes
//
// Two party drafts for friends rooms, both 5-man teams under the room's
// theme (user-confirmed 2026-09-01):
//
// DOLLAR TABLE - the viral "$15 to build a team" graphic: five price
// tiers ($5 legends down to $1 glue guys) dealt from the theme pool,
// snake draft, every pick must fit your remaining budget AND leave your
// team completable.
//
// AUCTION - players hit the block one at a time (smart random: weighted
// toward what the room still needs, star power paced through the night),
// $50 a team, $1 minimum raises, binding passes, GOING ONCE / GOING
// TWICE / SOLD.

export const PARTY_ROSTER_SIZE = 5
export const BUDGET_START = 15
export const BUDGET_PRICES = [5, 4, 3, 2, 1]
export const AUCTION_START = 50
const AUCTION_LOT_CAP = 150

export interface PartyTeamState {
  playerId: string
  roster: Roster
  budget: number
}

export interface PriceTier {
  price: number
  cardIds: string[]
}

export interface PartyPickSummary {
  playerId: string
  name: string
  season: number
  ovr: number
  price: number
}

interface PartyBase {
  players: DraftPlayer[]
  teams: Record<string, PartyTeamState>
  theme: string | null
  positionless: boolean
  seed: number
  lastPick: PartyPickSummary | null
  done: boolean
}

export interface BudgetState extends PartyBase {
  kind: 'budget'
  tiers: PriceTier[]
  order: string[]
  pickIndex: number
}

export type LotStage = 'open' | 'once' | 'twice'

export interface AuctionLot {
  cardId: string
  price: number // current high bid; 0 = no bids yet
  leaderId: string | null
  stage: LotStage
  passed: string[]
}

export interface AuctionState extends PartyBase {
  kind: 'auction'
  pool: string[] // curated revealable card ids, still available
  lot: AuctionLot | null
  lotIndex: number
  lastResult: { name: string; price: number; winnerName: string | null } | null
}

export type PartyState = BudgetState | AuctionState

export type PartyAction =
  | { type: 'BUDGET_PICK'; playerId: string; cardId: string; slot?: SlotId }
  | { type: 'AUCTION_BID'; playerId: string; amount: number }
  | { type: 'AUCTION_PASS'; playerId: string }

// ------------------------------------------------------------- pool prep

// One card per person: their best season passing the theme.
function bestPeople(pool: Card[], themeId: string): Card[] {
  const theme = themeById(themeId)
  const byPid = new Map<string, Card>()
  for (const c of pool) {
    if (!theme.test(c)) continue
    const cur = byPid.get(c.pid)
    if (!cur || c.ovr > cur.ovr || (c.ovr === cur.ovr && c.season > cur.season)) byPid.set(c.pid, c)
  }
  return [...byPid.values()].sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id))
}

const cardById = (ctx: DraftCtx, id: string) => ctx.pool.find((c) => c.id === id)!

// ------------------------------------------------------------ the table

// Rank cutoffs for the five price tags, richest first. $5 is reserved for
// the theme's true elites, $1 is the glue-guy shelf.
const TIER_CUTS = [0.05, 0.14, 0.3, 0.55, 1]

// Deal the table: K players per tier, seeded, with position coverage so
// full legal fives stay buildable (skipped for positionless themes).
export function buildBudgetTable(people: Card[], playerCount: number, seed: number, positionless: boolean): PriceTier[] {
  const rng = mulberry32(hashSeed(`table:${seed}`))
  const perTier = Math.max(8, Math.min(14, playerCount * 2 + 2))
  const tiers: PriceTier[] = []
  const bounds = [0, ...TIER_CUTS.map((cut) => Math.round(people.length * cut))]

  for (let t = 0; t < BUDGET_PRICES.length; t++) {
    const bucket = people.slice(bounds[t], bounds[t + 1])
    const shuffled = shuffle(rng, bucket)
    const chosen: Card[] = []
    if (!positionless) {
      // Two naturals per position first, so no tier strands a slot.
      for (const pos of STARTER_SLOTS) {
        for (const c of shuffled) {
          if (chosen.length >= perTier) break
          if (chosen.includes(c)) continue
          if (c.pos === pos && chosen.filter((x) => x.pos === pos).length < 2) chosen.push(c)
        }
      }
    }
    for (const c of shuffled) {
      if (chosen.length >= perTier) break
      if (!chosen.includes(c)) chosen.push(c)
    }
    tiers.push({ price: BUDGET_PRICES[t], cardIds: chosen.map((c) => c.id) })
  }
  return tiers
}

// --------------------------------------------------------- shared helpers

function openSlots(roster: Roster): SlotId[] {
  return STARTER_SLOTS.filter((slot) => roster[slot] === null)
}

function canFill(positionless: boolean, card: Card, slot: SlotId): boolean {
  return positionless || canPlaySlot(card, slot)
}

function hasOpenFor(state: PartyState, team: PartyTeamState, card: Card): boolean {
  return openSlots(team.roster).some((slot) => canFill(state.positionless, card, slot))
}

// Where a bought player lands: chosen open legal slot, else the most
// natural open slot (skill roles when positionless).
function landingSlot(state: PartyState, team: PartyTeamState, card: Card, chosen?: SlotId): SlotId {
  const open = openSlots(team.roster)
  if (chosen && open.includes(chosen) && canFill(state.positionless, card, chosen)) return chosen
  if (state.positionless) {
    return open.reduce((best, slot) => (roleFit(card, slot) > roleFit(card, best) ? slot : best))
  }
  const naturals = open.filter((slot) => slotCompat(card, slot) === 1)
  if (naturals.length > 0) return naturals[0]
  const legal = open.filter((slot) => canPlaySlot(card, slot))
  if (legal.length > 0) return legal[0]
  throw new Error('no open slot')
}

function place(state: PartyState, playerId: string, card: Card, price: number, chosen?: SlotId): PartyState {
  const team = state.teams[playerId]
  const slot = landingSlot(state, team, card, chosen)
  const roster: Roster = { ...team.roster, [slot]: card }
  return {
    ...state,
    teams: { ...state.teams, [playerId]: { ...team, roster, budget: team.budget - price } },
    lastPick: { playerId, name: card.name, season: card.season, ovr: card.ovr, price },
  } as PartyState
}

function teamFull(team: PartyTeamState): boolean {
  return openSlots(team.roster).length === 0
}

// ---------------------------------------------------------- budget draft

function snakeOrder(ids: string[], rounds: number): string[] {
  const order: string[] = []
  for (let r = 0; r < rounds; r++) order.push(...(r % 2 === 0 ? ids : [...ids].reverse()))
  return order
}

export function initBudget(players: DraftPlayer[], seed: number, ctx: DraftCtx, chosenTheme?: string | null): BudgetState {
  const theme = pickDraftTheme(ctx.pool, players.length, seed, PARTY_ROSTER_SIZE, chosenTheme)
  const positionless = themeNeedsPositionless(themeById(theme), ctx.pool, players.length)
  const people = bestPeople(ctx.pool, theme)
  return {
    kind: 'budget',
    players,
    teams: Object.fromEntries(
      players.map((p) => [p.id, { playerId: p.id, roster: emptyRoster(), budget: BUDGET_START }]),
    ),
    theme,
    positionless,
    seed,
    tiers: buildBudgetTable(people, players.length, seed, positionless),
    order: snakeOrder(
      players.map((p) => p.id),
      PARTY_ROSTER_SIZE,
    ),
    pickIndex: 0,
    lastPick: null,
    done: false,
  }
}

export function budgetTurnId(state: BudgetState): string | null {
  return state.done ? null : state.order[state.pickIndex]
}

function tableEntries(state: BudgetState, ctx: DraftCtx): { card: Card; price: number }[] {
  return state.tiers.flatMap((tier) => tier.cardIds.map((id) => ({ card: cardById(ctx, id), price: tier.price })))
}

// Can this team still finish a legal five from the remaining table with
// its remaining money? Tiny backtracking search - slots are <= 5 and only
// the cheapest few candidates per slot matter.
export function canCompleteTeam(state: BudgetState, ctx: DraftCtx, team: PartyTeamState): boolean {
  const slots = openSlots(team.roster)
  if (slots.length === 0) return true
  const table = tableEntries(state, ctx)

  const solve = (remaining: SlotId[], budget: number, used: Set<string>): boolean => {
    if (remaining.length === 0) return true
    // Most-constrained slot first.
    const options = remaining.map((slot) => ({
      slot,
      cards: table
        .filter((e) => !used.has(e.card.id) && canFill(state.positionless, e.card, slot))
        .sort((a, b) => a.price - b.price)
        .slice(0, 6),
    }))
    options.sort((a, b) => a.cards.length - b.cards.length)
    const { slot, cards } = options[0]
    const rest = remaining.filter((s) => s !== slot)
    for (const e of cards) {
      if (e.price > budget - rest.length) continue
      used.add(e.card.id)
      if (solve(rest, budget - e.price, used)) {
        used.delete(e.card.id)
        return true
      }
      used.delete(e.card.id)
    }
    return false
  }

  return solve(slots, team.budget, new Set())
}

// Everything this drafter may legally take right now: affordable, fits an
// open slot, and doesn't leave the team impossible to finish.
export function feasibleBudgetPicks(state: BudgetState, ctx: DraftCtx, playerId: string): { card: Card; price: number }[] {
  const team = state.teams[playerId]
  const picksLeft = openSlots(team.roster).length
  return tableEntries(state, ctx).filter(({ card, price }) => {
    if (price > team.budget - (picksLeft - 1)) return false
    if (!hasOpenFor(state, team, card)) return false
    const slot = landingSlot(state, team, card)
    const after: BudgetState = {
      ...state,
      teams: {
        ...state.teams,
        [playerId]: { ...team, roster: { ...team.roster, [slot]: card }, budget: team.budget - price },
      },
      tiers: state.tiers.map((t) => ({ ...t, cardIds: t.cardIds.filter((id) => id !== card.id) })),
    }
    return canCompleteTeam(after, ctx, after.teams[playerId])
  })
}

function removeFromTable(state: BudgetState, cardId: string): PriceTier[] {
  return state.tiers.map((t) => ({ ...t, cardIds: t.cardIds.filter((id) => id !== cardId) }))
}

// After every pick, advance; if a drafter is somehow stranded (others
// bought the pieces they needed), the table bails them out with the
// cheapest fitting player at whatever they can pay.
function advanceBudget(state: BudgetState, ctx: DraftCtx): BudgetState {
  let current = state
  for (;;) {
    const pickIndex = current.pickIndex + 1
    if (pickIndex >= current.order.length) return { ...current, pickIndex, done: true }
    current = { ...current, pickIndex }
    const playerId = current.order[current.pickIndex]
    if (feasibleBudgetPicks(current, ctx, playerId).length > 0) return current
    const team = current.teams[playerId]
    const bailout = tableEntries(current, ctx)
      .filter((e) => hasOpenFor(current, team, e.card))
      .sort((a, b) => a.price - b.price || b.card.ovr - a.card.ovr)[0]
    if (!bailout) return { ...current, done: true } // table exhausted - should not happen
    const picksLeft = openSlots(team.roster).length
    const pay = Math.min(bailout.price, Math.max(1, team.budget - (picksLeft - 1)))
    current = place(current, playerId, bailout.card, pay) as BudgetState
    current = { ...current, tiers: removeFromTable(current, bailout.card.id) }
  }
}

function applyBudget(state: BudgetState, action: PartyAction, ctx: DraftCtx): BudgetState {
  if (action.type !== 'BUDGET_PICK' || state.done) return state
  if (budgetTurnId(state) !== action.playerId) return state
  const entry = tableEntries(state, ctx).find((e) => e.card.id === action.cardId)
  if (!entry) return state
  if (!feasibleBudgetPicks(state, ctx, action.playerId).some((e) => e.card.id === action.cardId)) return state

  let next = place(state, action.playerId, entry.card, entry.price, action.slot) as BudgetState
  next = { ...next, tiers: removeFromTable(next, entry.card.id) }
  return advanceBudget(next, ctx)
}

// Budget CPU: best feasible talent, mild preference for saving a dollar.
export function cpuBudgetPick(state: BudgetState, ctx: DraftCtx): PartyAction | null {
  const playerId = budgetTurnId(state)
  if (!playerId) return null
  const options = feasibleBudgetPicks(state, ctx, playerId)
  if (options.length === 0) return null
  const best = options.reduce((a, b) => (b.card.ovr - b.price * 0.4 > a.card.ovr - a.price * 0.4 ? b : a))
  return { type: 'BUDGET_PICK', playerId, cardId: best.card.id }
}

// -------------------------------------------------------------- auction

// The curated auction pool: plenty of talent for every seat plus depth,
// position-spread so nobody's slot starves.
export function buildAuctionPool(people: Card[], playerCount: number): string[] {
  const size = Math.max(60, Math.min(150, playerCount * 25))
  const chosen: Card[] = []
  for (const pos of STARTER_SLOTS) {
    for (const c of people) {
      if (c.pos === pos && chosen.filter((x) => x.pos === pos).length < Math.ceil(size / 6)) chosen.push(c)
    }
  }
  for (const c of people) {
    if (chosen.length >= size) break
    if (!chosen.includes(c)) chosen.push(c)
  }
  return chosen
    .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id))
    .slice(0, size)
    .map((c) => c.id)
}

export function initAuction(players: DraftPlayer[], seed: number, ctx: DraftCtx, chosenTheme?: string | null): AuctionState {
  const theme = pickDraftTheme(ctx.pool, players.length, seed, PARTY_ROSTER_SIZE, chosenTheme)
  const positionless = themeNeedsPositionless(themeById(theme), ctx.pool, players.length)
  const people = bestPeople(ctx.pool, theme)
  const base: AuctionState = {
    kind: 'auction',
    players,
    teams: Object.fromEntries(
      players.map((p) => [p.id, { playerId: p.id, roster: emptyRoster(), budget: AUCTION_START }]),
    ),
    theme,
    positionless,
    seed,
    pool: buildAuctionPool(people, players.length),
    lot: null,
    lotIndex: 0,
    lastPick: null,
    lastResult: null,
    done: false,
  }
  return revealNext(base, ctx)
}

// What a team may still spend on one player: keep $1 for every other
// open slot.
export function maxBid(team: PartyTeamState): number {
  const open = openSlots(team.roster).length
  return open === 0 ? 0 : team.budget - (open - 1)
}

// Teams that could conceivably act on this lot (open fitting slot and
// money to at least match a $1 opener or raise the leader).
function liveBidders(state: AuctionState, ctx: DraftCtx): PartyTeamState[] {
  const lot = state.lot
  if (!lot) return []
  const card = cardById(ctx, lot.cardId)
  return Object.values(state.teams).filter((team) => {
    if (team.playerId === lot.leaderId) return false
    if (lot.passed.includes(team.playerId)) return false
    if (!hasOpenFor(state, team, card)) return false
    const needed = lot.leaderId === null ? 1 : lot.price + 1
    return maxBid(team) >= needed
  })
}

// The smart random reveal: seeded, weighted toward positions the room
// still needs, star power paced through the night, and only players
// somebody could actually take.
function revealNext(state: AuctionState, ctx: DraftCtx): AuctionState {
  const unfilled = Object.values(state.teams).filter((t) => !teamFull(t))
  if (unfilled.length === 0 || state.lotIndex >= AUCTION_LOT_CAP) return finishAuction(state, ctx)

  const usable = state.pool
    .map((id) => cardById(ctx, id))
    .filter((card) => unfilled.some((team) => hasOpenFor(state, team, card) && maxBid(team) >= 1))
  if (usable.length === 0) return finishAuction(state, ctx)

  const rng = mulberry32(hashSeed(`${state.seed}:lot:${state.lotIndex}`))

  // Position demand: how many open slots across the room each candidate
  // could serve (everyone counts equally in a positionless room).
  const demand = (card: Card) =>
    unfilled.reduce(
      (sum, team) => sum + openSlots(team.roster).filter((slot) => canFill(state.positionless, card, slot)).length,
      0,
    )

  // Pace the stars: cycle a quality band per lot so the block always has
  // rhythm - a headliner, then mid-tier fights, then value shopping.
  const sorted = [...usable].sort((a, b) => b.ovr - a.ovr)
  const bandOf = [
    [0, 0.15],
    [0.15, 0.45],
    [0.45, 0.8],
    [0.15, 0.45],
  ][state.lotIndex % 4]
  let band = sorted.slice(Math.floor(sorted.length * bandOf[0]), Math.max(Math.floor(sorted.length * bandOf[0]) + 1, Math.ceil(sorted.length * bandOf[1])))
  if (band.length === 0) band = sorted

  const weighted = band.flatMap((card) => Array.from({ length: Math.max(1, demand(card)) }, () => card))
  const card = weighted[Math.floor(rng() * weighted.length)]

  return {
    ...state,
    pool: state.pool.filter((id) => id !== card.id),
    lot: { cardId: card.id, price: 0, leaderId: null, stage: 'open', passed: [] },
    lotIndex: state.lotIndex + 1,
  }
}

// Auction over (or safety cap hit): any unfinished team auto-fills its
// open slots with the best remaining fits at $1 a head, so every game
// always reaches tip-off. Falls back past the drained reveal pool to the
// whole theme pool (discarded lots included - nobody owns them).
function finishAuction(state: AuctionState, ctx: DraftCtx): AuctionState {
  let current: AuctionState = { ...state, lot: null, done: true }
  const rostered = new Set(
    current.players.flatMap((p) => STARTER_SLOTS.map((s) => current.teams[p.id].roster[s]?.pid)).filter(Boolean),
  )
  const reserves = bestPeople(ctx.pool, current.theme!).filter((c) => !rostered.has(c.pid))
  for (const player of current.players) {
    let team = current.teams[player.id]
    while (!teamFull(team)) {
      const pick = reserves
        .filter((card) => !rostered.has(card.pid) && hasOpenFor(current, team, card))
        .sort((a, b) => b.ovr - a.ovr)[0]
      if (!pick) break
      rostered.add(pick.pid)
      current = place(current, player.id, pick, Math.min(1, team.budget)) as AuctionState
      current = { ...current, pool: current.pool.filter((id) => id !== pick.id) }
      team = current.teams[player.id]
    }
  }
  return current
}

function closeLot(state: AuctionState, ctx: DraftCtx): AuctionState {
  const lot = state.lot!
  const card = cardById(ctx, lot.cardId)
  let next: AuctionState
  if (lot.leaderId) {
    next = place(state, lot.leaderId, card, lot.price) as AuctionState
    const winner = state.players.find((p) => p.id === lot.leaderId)
    next = { ...next, lastResult: { name: card.name, price: lot.price, winnerName: winner?.name ?? null } }
  } else {
    next = { ...state, lastResult: { name: card.name, price: 0, winnerName: null } }
  }
  return revealNext({ ...next, lot: null }, ctx)
}

function applyAuction(state: AuctionState, action: PartyAction, ctx: DraftCtx): AuctionState {
  if (state.done || !state.lot) return state
  const lot = state.lot
  const team = state.teams[action.playerId]
  if (!team) return state

  if (action.type === 'AUCTION_BID') {
    const card = cardById(ctx, lot.cardId)
    if (action.playerId === lot.leaderId) return state
    if (lot.passed.includes(action.playerId)) return state
    if (!hasOpenFor(state, team, card)) return state
    const minAmount = lot.leaderId === null ? 1 : lot.price + 1
    const amount = Math.floor(action.amount)
    if (amount < minAmount || amount > maxBid(team)) return state
    return {
      ...state,
      lot: { ...lot, price: amount, leaderId: action.playerId, stage: 'open', passed: lot.passed },
    }
  }

  if (action.type === 'AUCTION_PASS') {
    if (action.playerId === lot.leaderId) return state
    if (lot.passed.includes(action.playerId)) return state
    const next: AuctionState = { ...state, lot: { ...lot, passed: [...lot.passed, action.playerId] } }
    // Everyone who could act has passed - hammer down immediately.
    if (liveBidders(next, ctx).length === 0) return closeLot(next, ctx)
    return next
  }

  return state
}

// The host's clock. One tick per stage: an unwanted lot dies on its first
// tick; a bid walks GOING ONCE -> GOING TWICE -> SOLD unless a new bid
// resets the ladder.
export function applyAuctionTick(state: AuctionState, ctx: DraftCtx): AuctionState {
  if (state.done || !state.lot) return state
  const lot = state.lot
  if (lot.leaderId === null) return closeLot(state, ctx) // nobody wanted him
  if (lot.stage === 'open') return { ...state, lot: { ...lot, stage: 'once' } }
  if (lot.stage === 'once') return { ...state, lot: { ...lot, stage: 'twice' } }
  return closeLot(state, ctx)
}

// Auction CPU: every bot prices every player off pool rank and bids while
// it's a bargain; passes once the market outruns the value.
export function auctionValue(state: AuctionState, ctx: DraftCtx, cardId: string): number {
  const cards = state.pool.map((id) => cardById(ctx, id))
  const all = [...cards, cardById(ctx, cardId)].sort((a, b) => b.ovr - a.ovr)
  const rank = all.findIndex((c) => c.id === cardId)
  const pct = all.length <= 1 ? 1 : 1 - rank / (all.length - 1)
  return Math.max(1, Math.round(1 + 27 * pct ** 2.2))
}

export function cpuAuctionActions(state: AuctionState, ctx: DraftCtx): PartyAction[] {
  if (state.done || !state.lot) return []
  const lot = state.lot
  const card = cardById(ctx, lot.cardId)
  const value = auctionValue(state, ctx, card.id)
  const actions: PartyAction[] = []
  for (const player of state.players) {
    if (!player.isCpu) continue
    const team = state.teams[player.id]
    if (player.id === lot.leaderId || lot.passed.includes(player.id)) continue
    if (!hasOpenFor(state, team, card)) continue
    const needed = lot.leaderId === null ? 1 : lot.price + 1
    if (needed <= Math.min(value, maxBid(team))) {
      actions.push({ type: 'AUCTION_BID', playerId: player.id, amount: needed })
    } else {
      actions.push({ type: 'AUCTION_PASS', playerId: player.id })
    }
  }
  return actions
}

// ---------------------------------------------------------------- shared

export function applyParty(state: PartyState, action: PartyAction, ctx: DraftCtx): PartyState {
  return state.kind === 'budget' ? applyBudget(state, action, ctx) : applyAuction(state, action, ctx)
}

// Runs every pending CPU move (budget turns, auction bids/passes) until
// the party is waiting on a human.
export function advancePartyCpu(state: PartyState, ctx: DraftCtx): PartyState {
  let current = state
  for (let guard = 0; guard < 400; guard++) {
    if (current.kind === 'budget') {
      const turnId = budgetTurnId(current)
      const player = current.players.find((p) => p.id === turnId)
      if (!player?.isCpu) return current
      const action = cpuBudgetPick(current, ctx)
      if (!action) return current
      const next = applyParty(current, action, ctx)
      if (next === current) return current
      current = next
    } else {
      const actions = cpuAuctionActions(current, ctx)
      if (actions.length === 0) return current
      let changed = false
      for (const action of actions) {
        const next = applyParty(current, action, ctx)
        if (next !== current) {
          current = next
          changed = true
          break // re-evaluate after every state change
        }
      }
      if (!changed) return current
    }
  }
  return current
}

export function partyRosters(state: PartyState): Record<string, Roster> {
  return Object.fromEntries(state.players.map((p) => [p.id, state.teams[p.id].roster]))
}
