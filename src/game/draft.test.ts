import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import { canFieldStarters, canPlaySlot, rosterCards, STARTER_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import {
  advanceCpuTurns,
  applyAction,
  cpuChooseTheme,
  currentPlayerId,
  draftFillerTeam,
  initDraft,
  ROUNDS,
  type DraftCtx,
  type DraftPlayer,
  type DraftState,
} from './draft'

let pool: Card[] = []
let ctx: DraftCtx

const HUMANS: DraftPlayer[] = [
  { id: 'p1', name: 'Div', isCpu: false },
  { id: 'p2', name: 'Jay', isCpu: false },
  { id: 'p3', name: 'Sam', isCpu: false },
]

beforeAll(async () => {
  pool = await loadCards()
  ctx = { pool }
})

// Plays every turn like a knowledgeable CPU - a fast way to drive a full
// legal draft through the typed flow.
function playOut(state: DraftState): DraftState {
  let current = state
  while (!current.done) {
    current = applyAction(current, cpuChooseTheme(current, ctx), ctx)
  }
  return current
}

// A positional-theme draft, pinned so slot-legality assertions hold.
function positionalDraft(seed: number): DraftState {
  return initDraft('themes', HUMANS, seed, ctx, 'era-90s')
}

describe('turn rules (typed picks only)', () => {
  it('builds a snake order and opens with no board - typing is the game', () => {
    const state = positionalDraft(42)
    expect(state.order.length).toBe(ROUNDS * 3)
    expect(state.order.slice(0, 6)).toEqual(['p1', 'p2', 'p3', 'p3', 'p2', 'p1'])
    expect(state.offer).toBeNull()
    expect(state.positionless).toBe(false)
  })

  it('rejects typed picks from a player out of turn', () => {
    const state = positionalDraft(42)
    const stolen = applyAction(state, { type: 'TYPE_PICK', playerId: 'p2', query: 'Michael Jordan' }, ctx)
    expect(stolen).toBe(state)
  })

  it('completes with legal teams and one person per league', () => {
    const state = playOut(positionalDraft(99))
    expect(state.done).toBe(true)
    for (const playerId of ['p1', 'p2', 'p3']) {
      const cards = rosterCards(state.teams[playerId].roster)
      expect(cards.length).toBe(ROUNDS)
      expect(canFieldStarters(cards)).toBe(true)
      for (const slot of STARTER_SLOTS) expect(state.teams[playerId].roster[slot]).not.toBeNull()
    }
    const allPids = ['p1', 'p2', 'p3'].flatMap((id) => rosterCards(state.teams[id].roster).map((c) => c.pid))
    expect(new Set(allPids).size).toBe(allPids.length)
  })
})

describe('slot control', () => {
  // A '90s card the current drafter can legally call by name.
  function callable(state: DraftState): Card {
    const drafted = new Set(state.draftedPids)
    return pool.find(
      (c) => !drafted.has(c.pid) && c.season >= 1990 && c.season <= 1999 && c.ovr >= 90,
    )!
  }

  it('a chosen legal open slot wins; an illegal one falls back to auto', () => {
    const state = positionalDraft(42)
    const card = callable(state)
    const legal = STARTER_SLOTS.find((slot) => canPlaySlot(card, slot))
    if (legal) {
      const placed = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: card.name, slot: legal }, ctx)
      expect(placed.teams.p1.roster[legal]!.pid).toBe(card.pid)
    }
    const illegal = STARTER_SLOTS.find((slot) => !canPlaySlot(card, slot))
    if (illegal) {
      const auto = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: card.name, slot: illegal }, ctx)
      expect(rosterCards(auto.teams.p1.roster).map((c) => c.pid)).toContain(card.pid)
      expect(auto.teams.p1.roster[illegal]?.pid).not.toBe(card.pid)
    }
  })

  it('the bench is a valid chosen slot', () => {
    const state = positionalDraft(42)
    const card = callable(state)
    const placed = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: card.name, slot: 'B2' }, ctx)
    expect(placed.teams.p1.roster.B2!.pid).toBe(card.pid)
  })
})

describe('MOVE', () => {
  it('swaps two legally-compatible slots and rejects illegal moves', () => {
    const state = playOut(positionalDraft(33))
    const team = state.teams.p1
    const pg = team.roster.PG!
    const b1 = team.roster.B1!
    const moved = applyAction(state, { type: 'MOVE', playerId: 'p1', from: 'PG', to: 'B1' }, ctx)
    if (b1 === null || ['PG', 'SG'].includes(b1.pos) || b1.pos2 === 'PG' || b1.pos2 === 'SG') {
      expect(moved.teams.p1.roster.B1!.id).toBe(pg.id)
    }
    const center = state.teams.p1.roster.C!
    if (Math.abs(['PG', 'SG', 'SF', 'PF', 'C'].indexOf(center.pos) - 0) > 1 && center.pos2 === null) {
      expect(applyAction(state, { type: 'MOVE', playerId: 'p1', from: 'C', to: 'PG' }, ctx)).toBe(state)
    }
  })
})

describe('CPU turns', () => {
  it('advanceCpuTurns plays CPU turns and pauses on the human', () => {
    const players: DraftPlayer[] = [
      { id: 'me', name: 'Div', isCpu: false },
      { id: 'cpu1', name: 'BOT A', isCpu: true },
      { id: 'cpu2', name: 'BOT B', isCpu: true },
    ]
    let state = initDraft('themes', players, 13, ctx, 'era-90s')
    expect(currentPlayerId(state)).toBe('me')
    state = applyAction(state, cpuChooseTheme(state, ctx), ctx)
    state = advanceCpuTurns(state, ctx)
    // snake: me, cpu1, cpu2, cpu2, cpu1, me -> back to the human
    expect(currentPlayerId(state)).toBe('me')
    expect(rosterCards(state.teams.cpu1.roster).length).toBe(2)
    expect(rosterCards(state.teams.cpu2.roster).length).toBe(2)
  })
})

describe('draftFillerTeam', () => {
  it('builds legal opposition that avoids all drafted persons, stronger at higher bias', () => {
    const state = playOut(positionalDraft(55))
    const drafted = new Set(state.draftedPids)
    const filler = draftFillerTeam(drafted, ctx, 777, 0.6)
    const cards = rosterCards(filler.roster)
    expect(cards.length).toBe(ROUNDS)
    expect(canFieldStarters(cards)).toBe(true)
    for (const card of cards) expect(drafted.has(card.pid)).toBe(false)

    const avg = (seed: number, bias: number) => {
      const team = draftFillerTeam(new Set<string>(), ctx, seed, bias)
      const cs = rosterCards(team.roster)
      return cs.reduce((s, c) => s + c.ovr, 0) / cs.length
    }
    const strong = Array.from({ length: 6 }, (_, i) => avg(i, 0.85)).reduce((a, b) => a + b, 0) / 6
    const loose = Array.from({ length: 6 }, (_, i) => avg(i, 0.2)).reduce((a, b) => a + b, 0) / 6
    expect(strong).toBeGreaterThan(loose)
  })
})
