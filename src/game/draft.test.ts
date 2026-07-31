import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import { canFieldStarters, rosterCards, STARTER_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import {
  advanceCpuTurns,
  applyAction,
  cpuChoose,
  currentPlayerId,
  currentRound,
  draftFillerTeam,
  initDraft,
  REROLLS_PER_PLAYER,
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

// Plays every turn with the CPU heuristic regardless of isCpu - a fast way
// to drive a full legal draft in tests.
function playOut(state: DraftState): DraftState {
  let current = state
  while (!current.done) {
    current = applyAction(current, cpuChoose(current), ctx)
  }
  return current
}

describe('initDraft', () => {
  it('builds a snake order and opens with a round-1 offer', () => {
    const state = initDraft('tiers', HUMANS, 42, ctx)
    expect(state.order.length).toBe(ROUNDS * 3)
    expect(state.order.slice(0, 6)).toEqual(['p1', 'p2', 'p3', 'p3', 'p2', 'p1'])
    expect(currentRound(state)).toBe(1)
    expect(state.offer).not.toBeNull()
    expect(state.offer!.cards.length).toBeGreaterThan(0)
    expect(['GOAT', 'SUPERSTAR']).toContain(state.offer!.tier)
  })

  it('is deterministic: same seed, same opening offer', () => {
    const a = initDraft('tiers', HUMANS, 7, ctx)
    const b = initDraft('tiers', HUMANS, 7, ctx)
    expect(a.offer!.cards.map((c) => c.id)).toEqual(b.offer!.cards.map((c) => c.id))
  })
})

describe('turn and offer rules', () => {
  it('rejects actions from a player out of turn', () => {
    const state = initDraft('tiers', HUMANS, 42, ctx)
    const stolen = applyAction(state, { type: 'TAKE', playerId: 'p2', cardId: state.offer!.cards[0].id }, ctx)
    expect(stolen).toBe(state)
  })

  it('rejects taking a card that is not in the offer', () => {
    const state = initDraft('tiers', HUMANS, 42, ctx)
    const offIds = new Set(state.offer!.cards.map((c) => c.id))
    const outsider = pool.find((c) => !offIds.has(c.id))!
    const cheated = applyAction(state, { type: 'TAKE', playerId: 'p1', cardId: outsider.id }, ctx)
    expect(cheated).toBe(state)
  })

  it('TAKE places the card, advances the turn, and generates the next offer', () => {
    const state = initDraft('tiers', HUMANS, 42, ctx)
    const card = state.offer!.cards[0]
    const next = applyAction(state, { type: 'TAKE', playerId: 'p1', cardId: card.id }, ctx)
    expect(rosterCards(next.teams.p1.roster).map((c) => c.id)).toContain(card.id)
    expect(currentPlayerId(next)).toBe('p2')
    expect(next.offer!.forPlayerId).toBe('p2')
    expect(next.draftedPids).toContain(card.pid)
  })

  it('REROLL burns a token, changes the offer, and stops at zero', () => {
    let state = initDraft('tiers', HUMANS, 42, ctx)
    const firstOffer = state.offer!.cards.map((c) => c.id)
    state = applyAction(state, { type: 'REROLL', playerId: 'p1' }, ctx)
    expect(state.teams.p1.rerollsLeft).toBe(REROLLS_PER_PLAYER - 1)
    expect(state.offer!.cards.map((c) => c.id)).not.toEqual(firstOffer)
    state = applyAction(state, { type: 'REROLL', playerId: 'p1' }, ctx)
    expect(state.teams.p1.rerollsLeft).toBe(0)
    const exhausted = applyAction(state, { type: 'REROLL', playerId: 'p1' }, ctx)
    expect(exhausted).toBe(state)
  })

  it('never offers an already-drafted person, in any season', () => {
    let state = initDraft('tiers', HUMANS, 11, ctx)
    for (let i = 0; i < 12 && !state.done; i++) {
      const drafted = new Set(state.draftedPids)
      for (const card of state.offer!.cards) {
        expect(drafted.has(card.pid)).toBe(false)
      }
      state = applyAction(state, cpuChoose(state), ctx)
    }
  })
})

describe('full tiered draft', () => {
  it('ends with every team holding 8 cards that can field five starters', () => {
    const state = playOut(initDraft('tiers', HUMANS, 99, ctx))
    expect(state.done).toBe(true)
    for (const playerId of ['p1', 'p2', 'p3']) {
      const cards = rosterCards(state.teams[playerId].roster)
      expect(cards.length).toBe(ROUNDS)
      expect(canFieldStarters(cards)).toBe(true)
      for (const slot of STARTER_SLOTS) {
        expect(state.teams[playerId].roster[slot]).not.toBeNull()
      }
    }
  })

  it('no person appears on two teams', () => {
    const state = playOut(initDraft('tiers', HUMANS, 123, ctx))
    const allPids = ['p1', 'p2', 'p3'].flatMap((id) => rosterCards(state.teams[id].roster).map((c) => c.pid))
    expect(new Set(allPids).size).toBe(allPids.length)
  })

  it('every team gets early-round star power (round 1 is GOAT or SUPERSTAR)', () => {
    const state = playOut(initDraft('tiers', HUMANS, 7, ctx))
    for (const playerId of ['p1', 'p2', 'p3']) {
      const cards = rosterCards(state.teams[playerId].roster)
      expect(cards.some((c) => c.tier === 'GOAT' || c.tier === 'SUPERSTAR')).toBe(true)
    }
  })
})

describe('MOVE', () => {
  it('swaps two legally-compatible slots and rejects illegal moves', () => {
    const state = playOut(initDraft('tiers', HUMANS, 33, ctx))
    const team = state.teams.p1
    const pg = team.roster.PG!
    const b1 = team.roster.B1!
    const moved = applyAction(state, { type: 'MOVE', playerId: 'p1', from: 'PG', to: 'B1' }, ctx)
    if (b1 === null || ['PG', 'SG'].includes(b1.pos) || b1.pos2 === 'PG' || b1.pos2 === 'SG') {
      expect(moved.teams.p1.roster.B1!.id).toBe(pg.id)
    }
    const centerToPg = applyAction(
      state,
      { type: 'MOVE', playerId: 'p1', from: 'C', to: 'PG' },
      ctx,
    )
    const center = state.teams.p1.roster.C!
    if (Math.abs(['PG', 'SG', 'SF', 'PF', 'C'].indexOf(center.pos) - 0) > 1 && center.pos2 === null) {
      expect(centerToPg).toBe(state)
    }
  })
})

describe('solo mode with CPU opponents', () => {
  it('advanceCpuTurns plays CPU turns and pauses on the human', () => {
    const players: DraftPlayer[] = [
      { id: 'me', name: 'Div', isCpu: false },
      { id: 'cpu1', name: 'BOT A', isCpu: true },
      { id: 'cpu2', name: 'BOT B', isCpu: true },
    ]
    let state = initDraft('tiers', players, 13, ctx)
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
  it('builds a legal 8-man team that avoids all drafted persons', () => {
    const state = playOut(initDraft('tiers', HUMANS, 55, ctx))
    const filler = draftFillerTeam(state, ctx, 777)
    const cards = rosterCards(filler.roster)
    expect(cards.length).toBe(ROUNDS)
    expect(canFieldStarters(cards)).toBe(true)
    const drafted = new Set(state.draftedPids)
    for (const card of cards) expect(drafted.has(card.pid)).toBe(false)
  })
})
