import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import { canFieldStarters, canPlaySlot, rosterCards, STARTER_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import {
  advanceCpuTurns,
  applyAction,
  cpuChoose,
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

// Plays every turn off the board - a fast way to drive a full legal draft.
function playOut(state: DraftState): DraftState {
  let current = state
  while (!current.done) {
    current = applyAction(current, cpuChoose(current), ctx)
  }
  return current
}

describe('turn and board rules (grid input)', () => {
  it('builds a snake order and opens with a themed board', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'grid')
    expect(state.order.length).toBe(ROUNDS * 3)
    expect(state.order.slice(0, 6)).toEqual(['p1', 'p2', 'p3', 'p3', 'p2', 'p1'])
    expect(state.offer).not.toBeNull()
    expect(state.offer!.cards.length).toBeGreaterThan(0)
  })

  it('rejects actions from a player out of turn and cards off the board', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'grid')
    const stolen = applyAction(state, { type: 'TAKE', playerId: 'p2', cardId: state.offer!.cards[0].id }, ctx)
    expect(stolen).toBe(state)
    const offIds = new Set(state.offer!.cards.map((c) => c.id))
    const outsider = pool.find((c) => !offIds.has(c.id))!
    const cheated = applyAction(state, { type: 'TAKE', playerId: 'p1', cardId: outsider.id }, ctx)
    expect(cheated).toBe(state)
  })

  it('never offers an already-drafted person, in any season', () => {
    let state = initDraft('themes', HUMANS, 11, ctx, 'grid')
    for (let i = 0; i < 12 && !state.done; i++) {
      const drafted = new Set(state.draftedPids)
      for (const card of state.offer!.cards) {
        expect(drafted.has(card.pid)).toBe(false)
      }
      state = applyAction(state, cpuChoose(state), ctx)
    }
  })

  it('completes with legal teams and one person per league', () => {
    const state = playOut(initDraft('themes', HUMANS, 99, ctx, 'grid'))
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
  it('a chosen legal open slot wins; an illegal one falls back to auto', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'grid')
    const card = state.offer!.cards[0]
    const legal = STARTER_SLOTS.find((slot) => canPlaySlot(card, slot))
    if (legal) {
      const placed = applyAction(state, { type: 'TAKE', playerId: 'p1', cardId: card.id, slot: legal }, ctx)
      expect(placed.teams.p1.roster[legal]!.id).toBe(card.id)
    }
    const illegal = STARTER_SLOTS.find((slot) => !canPlaySlot(card, slot))
    if (illegal) {
      const auto = applyAction(state, { type: 'TAKE', playerId: 'p1', cardId: card.id, slot: illegal }, ctx)
      expect(rosterCards(auto.teams.p1.roster).map((c) => c.id)).toContain(card.id)
      expect(auto.teams.p1.roster[illegal]?.id).not.toBe(card.id)
    }
  })

  it('the bench is a valid chosen slot', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'grid')
    const card = state.offer!.cards[0]
    const placed = applyAction(state, { type: 'TAKE', playerId: 'p1', cardId: card.id, slot: 'B2' }, ctx)
    expect(placed.teams.p1.roster.B2!.id).toBe(card.id)
  })
})

describe('MOVE', () => {
  it('swaps two legally-compatible slots and rejects illegal moves', () => {
    const state = playOut(initDraft('themes', HUMANS, 33, ctx, 'grid'))
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
    let state = initDraft('themes', players, 13, ctx, 'grid')
    expect(currentPlayerId(state)).toBe('me')
    state = applyAction(state, { type: 'TAKE', playerId: 'me', cardId: state.offer!.cards[0].id }, ctx)
    state = advanceCpuTurns(state, ctx)
    // snake: me, cpu1, cpu2, cpu2, cpu1, me -> back to the human
    expect(currentPlayerId(state)).toBe('me')
    expect(rosterCards(state.teams.cpu1.roster).length).toBe(2)
    expect(rosterCards(state.teams.cpu2.roster).length).toBe(2)
  })
})

describe('draftFillerTeam', () => {
  it('builds legal opposition that avoids all drafted persons, stronger at higher bias', () => {
    const state = playOut(initDraft('themes', HUMANS, 55, ctx, 'grid'))
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
