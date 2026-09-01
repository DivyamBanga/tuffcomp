import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import { STARTER_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import type { DraftCtx, DraftPlayer } from './draft'
import {
  advancePartyCpu,
  applyParty,
  applyAuctionTick,
  AUCTION_START,
  BUDGET_START,
  budgetTurnId,
  buildBudgetTable,
  feasibleBudgetPicks,
  initAuction,
  initBudget,
  maxBid,
  partyRosters,
  type AuctionState,
  type BudgetState,
} from './party'
import { themeById } from './themes'

let pool: Card[] = []
let ctx: DraftCtx

const FOUR: DraftPlayer[] = [
  { id: 'p1', name: 'Div', isCpu: false },
  { id: 'p2', name: 'Jay', isCpu: false },
  { id: 'p3', name: 'Sam', isCpu: false },
  { id: 'p4', name: 'Kav', isCpu: false },
]

const BOTS: DraftPlayer[] = [
  { id: 'c1', name: 'BOT A', isCpu: true },
  { id: 'c2', name: 'BOT B', isCpu: true },
  { id: 'c3', name: 'BOT C', isCpu: true },
]

beforeAll(async () => {
  pool = await loadCards()
  ctx = { pool }
})

// ------------------------------------------------------------ dollar table

describe('dollar table', () => {
  it('deals five tiers, $5 elite down to $1, position-covered, no duplicates', () => {
    const state = initBudget(FOUR, 42, ctx, 'era-90s')
    expect(state.tiers.map((t) => t.price)).toEqual([5, 4, 3, 2, 1])
    const all = state.tiers.flatMap((t) => t.cardIds)
    expect(new Set(all).size).toBe(all.length)
    const card = (id: string) => pool.find((c) => c.id === id)!
    // The $5 shelf genuinely outranks the $1 shelf.
    const avg = (ids: string[]) => ids.reduce((s, id) => s + card(id).ovr, 0) / ids.length
    expect(avg(state.tiers[0].cardIds)).toBeGreaterThan(avg(state.tiers[4].cardIds) + 10)
    // Theme respected everywhere.
    const theme = themeById('era-90s')
    for (const id of all) expect(theme.test(card(id)), id).toBe(true)
    // Each tier covers every position with at least two naturals.
    for (const tier of state.tiers) {
      for (const posn of STARTER_SLOTS) {
        expect(tier.cardIds.filter((id) => card(id).pos === posn).length, `$${tier.price} ${posn}`).toBeGreaterThanOrEqual(2)
      }
    }
    // Everyone starts at $15 with an empty five.
    for (const p of FOUR) expect(state.teams[p.id].budget).toBe(BUDGET_START)
  })

  it('enforces turn, budget, and completability on every pick', () => {
    const state = initBudget(FOUR, 42, ctx, 'era-90s')
    const options = feasibleBudgetPicks(state, ctx, 'p1')
    expect(options.length).toBeGreaterThan(0)
    // A $5 star is affordable up front ($15 - 4 remaining picks = $11 cap).
    expect(options.some((o) => o.price === 5)).toBe(true)

    // Out of turn: rejected.
    const stolen = applyParty(state, { type: 'BUDGET_PICK', playerId: 'p2', cardId: options[0].card.id }, ctx)
    expect(stolen).toBe(state)

    // A legal pick lands, charges the budget, and leaves the table.
    const five = options.find((o) => o.price === 5)!
    const next = applyParty(state, { type: 'BUDGET_PICK', playerId: 'p1', cardId: five.card.id }, ctx) as BudgetState
    expect(next.teams.p1.budget).toBe(BUDGET_START - 5)
    expect(next.tiers.flatMap((t) => t.cardIds)).not.toContain(five.card.id)
    expect(budgetTurnId(next)).toBe('p2')
    expect(next.lastPick?.price).toBe(5)
  })

  it('never lets a drafter overspend into an unfinishable team', () => {
    let state = initBudget(FOUR, 42, ctx, 'era-90s')
    // Drive p1 through three $5/$4 picks via the feasibility list itself:
    // after 5+5 the cap is 15-10-2 = $3, so no third big buy can appear.
    const buy = (price: number) => {
      const turn = budgetTurnId(state)!
      const pick = feasibleBudgetPicks(state, ctx, turn)
        .filter((o) => o.price === price)
        .sort((a, b) => b.card.ovr - a.card.ovr)[0]
      expect(pick, `$${price} available for ${turn}`).toBeDefined()
      state = applyParty(state, { type: 'BUDGET_PICK', playerId: turn, cardId: pick.card.id }, ctx) as BudgetState
    }
    buy(5) // p1
    buy(1) // p2
    buy(1) // p3
    buy(1) // p4 (snake turns around)
    buy(1) // p4 again
    buy(1) // p3
    buy(1) // p2
    buy(5) // p1's second star: spent 10 of 15 with 3 picks left
    const p1Options = feasibleBudgetPicks(state, ctx, budgetTurnId(state) === 'p1' ? 'p1' : 'p1')
    // $15 - $10 = $5 left for 3 picks -> nothing above $3 is takeable.
    for (const o of p1Options) expect(o.price).toBeLessThanOrEqual(3)
  })

  it('an all-bot table draft completes: full legal fives, budgets respected', () => {
    const state = advancePartyCpu(initBudget(BOTS, 7, ctx, 'era-00s'), ctx) as BudgetState
    expect(state.done).toBe(true)
    for (const p of BOTS) {
      const team = state.teams[p.id]
      for (const slot of STARTER_SLOTS) expect(team.roster[slot], `${p.id} ${slot}`).not.toBeNull()
      expect(team.budget).toBeGreaterThanOrEqual(0)
      const spent = BUDGET_START - team.budget
      expect(spent).toBeLessThanOrEqual(BUDGET_START)
      expect(spent).toBeGreaterThanOrEqual(5) // five players, $1 minimum each
    }
    // One person per league.
    const pids = BOTS.flatMap((p) => STARTER_SLOTS.map((s) => state.teams[p.id].roster[s]!.pid))
    expect(new Set(pids).size).toBe(pids.length)
  })

  it('positionless themes deal a table without position quotas and still complete', () => {
    const state = advancePartyCpu(initBudget(BOTS, 5, ctx, 'bio-sevenfeet'), ctx) as BudgetState
    expect(state.positionless).toBe(true)
    expect(state.done).toBe(true)
    const theme = themeById('bio-sevenfeet')
    for (const p of BOTS) {
      for (const slot of STARTER_SLOTS) {
        expect(theme.test(state.teams[p.id].roster[slot]!)).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------- auction

describe('auction', () => {
  it('opens with a lot on the block and $50 budgets', () => {
    const state = initAuction(FOUR, 42, ctx, 'era-90s')
    expect(state.lot).not.toBeNull()
    expect(state.lot!.price).toBe(0)
    expect(state.lot!.leaderId).toBeNull()
    for (const p of FOUR) expect(state.teams[p.id].budget).toBe(AUCTION_START)
    // The block player fits the theme.
    const card = pool.find((c) => c.id === state.lot!.cardId)!
    expect(themeById('era-90s').test(card)).toBe(true)
  })

  it('enforces bid rules: $1 opener, +$1 raises, max bid protects open slots', () => {
    const state = initAuction(FOUR, 42, ctx, 'era-90s')
    // Opening below $1 or above the cap: rejected.
    expect(applyParty(state, { type: 'AUCTION_BID', playerId: 'p1', amount: 0 }, ctx)).toBe(state)
    expect(applyParty(state, { type: 'AUCTION_BID', playerId: 'p1', amount: 47 }, ctx)).toBe(state)
    // maxBid = 50 - 4 other open slots = 46.
    expect(maxBid(state.teams.p1)).toBe(46)

    const opened = applyParty(state, { type: 'AUCTION_BID', playerId: 'p1', amount: 12 }, ctx) as AuctionState
    expect(opened.lot!.price).toBe(12)
    expect(opened.lot!.leaderId).toBe('p1')
    // The leader cannot outbid themselves; a raise must beat the price.
    expect(applyParty(opened, { type: 'AUCTION_BID', playerId: 'p1', amount: 13 }, ctx)).toBe(opened)
    expect(applyParty(opened, { type: 'AUCTION_BID', playerId: 'p2', amount: 12 }, ctx)).toBe(opened)
    const raised = applyParty(opened, { type: 'AUCTION_BID', playerId: 'p2', amount: 13 }, ctx) as AuctionState
    expect(raised.lot!.leaderId).toBe('p2')
    expect(raised.lot!.stage).toBe('open')
  })

  it('the hammer: GOING ONCE, GOING TWICE, SOLD - and a fresh bid resets the ladder', () => {
    let state = initAuction(FOUR, 42, ctx, 'era-90s')
    const cardId = state.lot!.cardId
    state = applyParty(state, { type: 'AUCTION_BID', playerId: 'p1', amount: 5 }, ctx) as AuctionState
    state = applyAuctionTick(state, ctx)
    expect(state.lot!.stage).toBe('once')
    // A rescue bid resets the drama.
    state = applyParty(state, { type: 'AUCTION_BID', playerId: 'p3', amount: 6 }, ctx) as AuctionState
    expect(state.lot!.stage).toBe('open')
    state = applyAuctionTick(state, ctx)
    state = applyAuctionTick(state, ctx)
    expect(state.lot!.stage).toBe('twice')
    state = applyAuctionTick(state, ctx) // SOLD
    const card = pool.find((c) => c.id === cardId)!
    const roster = state.teams.p3.roster
    expect(STARTER_SLOTS.some((s) => roster[s]?.id === card.id)).toBe(true)
    expect(state.teams.p3.budget).toBe(AUCTION_START - 6)
    expect(state.lastResult?.winnerName).toBe('Sam')
    expect(state.lot).not.toBeNull() // next player already on the block
    expect(state.lot!.cardId).not.toBe(cardId)
  })

  it('a lot nobody wants dies on the clock; binding passes hammer early', () => {
    let state = initAuction(FOUR, 42, ctx, 'era-90s')
    const firstCard = state.lot!.cardId
    // Tick with no bids: discarded, next lot up.
    state = applyAuctionTick(state, ctx)
    expect(state.lastResult?.winnerName).toBeNull()
    expect(state.lot!.cardId).not.toBe(firstCard)

    // p1 opens, everyone else passes -> instant SOLD to p1.
    state = applyParty(state, { type: 'AUCTION_BID', playerId: 'p1', amount: 3 }, ctx) as AuctionState
    state = applyParty(state, { type: 'AUCTION_PASS', playerId: 'p2' }, ctx) as AuctionState
    state = applyParty(state, { type: 'AUCTION_PASS', playerId: 'p3' }, ctx) as AuctionState
    const before = state.lot!.cardId
    state = applyParty(state, { type: 'AUCTION_PASS', playerId: 'p4' }, ctx) as AuctionState
    expect(state.lastResult?.price).toBe(3)
    expect(state.lot === null || state.lot.cardId !== before).toBe(true)
  })

  it('an all-bot auction completes with five legal players and budgets intact', () => {
    let state = initAuction(BOTS, 9, ctx, 'era-10s')
    let guard = 0
    while (!state.done && guard++ < 400) {
      state = advancePartyCpu(state, ctx) as AuctionState
      if (!state.done) state = applyAuctionTick(state, ctx)
    }
    expect(state.done).toBe(true)
    for (const p of BOTS) {
      const team = state.teams[p.id]
      for (const slot of STARTER_SLOTS) expect(team.roster[slot], `${p.id} ${slot}`).not.toBeNull()
      expect(team.budget).toBeGreaterThanOrEqual(0)
    }
    const rosters = partyRosters(state)
    const pids = BOTS.flatMap((p) => STARTER_SLOTS.map((s) => rosters[p.id][s]!.pid))
    expect(new Set(pids).size).toBe(pids.length)
  })

  it('is deterministic: same seed and actions, same table and reveals', () => {
    const a = initBudget(FOUR, 123, ctx, 'era-80s')
    const b = initBudget(FOUR, 123, ctx, 'era-80s')
    expect(a.tiers).toEqual(b.tiers)
    const x = initAuction(FOUR, 123, ctx, 'era-80s')
    const y = initAuction(FOUR, 123, ctx, 'era-80s')
    expect(x.lot).toEqual(y.lot)
    expect(x.pool).toEqual(y.pool)
  })
})

// -------------------------------------------------------- table generator

describe('buildBudgetTable', () => {
  it('scales tier size with the room and never duplicates people', () => {
    const theme = themeById('era-90s')
    const byPid = new Map<string, Card>()
    for (const c of pool) {
      if (!theme.test(c)) continue
      const cur = byPid.get(c.pid)
      if (!cur || c.ovr > cur.ovr) byPid.set(c.pid, c)
    }
    const people = [...byPid.values()].sort((a, b) => b.ovr - a.ovr)
    const small = buildBudgetTable(people, 2, 1, false)
    const big = buildBudgetTable(people, 8, 1, false)
    expect(big[0].cardIds.length).toBeGreaterThan(small[0].cardIds.length)
    const pids = big.flatMap((t) => t.cardIds).map((id) => pool.find((c) => c.id === id)!.pid)
    expect(new Set(pids).size).toBe(pids.length)
  })
})
