import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import { canFieldStarters, rosterCards, STARTER_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import {
  advanceCpuTurns,
  applyAction,
  currentPlayerId,
  initDraft,
  ROUNDS,
  STRIKES_PER_PLAYER,
  type DraftCtx,
  type DraftPlayer,
  type DraftState,
} from './draft'
import { resolveTypedPick, themeById } from './themes'

let pool: Card[] = []
let ctx: DraftCtx

const HUMANS: DraftPlayer[] = [
  { id: 'p1', name: 'Div', isCpu: false },
  { id: 'p2', name: 'Jay', isCpu: false },
  { id: 'p3', name: 'Sam', isCpu: false },
]

const CPUS: DraftPlayer[] = [
  { id: 'c1', name: 'BOT A', isCpu: true },
  { id: 'c2', name: 'BOT B', isCpu: true },
  { id: 'c3', name: 'BOT C', isCpu: true },
]

beforeAll(async () => {
  pool = await loadCards()
  ctx = { pool }
})

// A card whose name resolves round-trip to its own person and fits the
// draft's theme - a guaranteed-valid typed pick.
function validTypedPick(state: DraftState): Card {
  const theme = themeById(state.theme!)
  const drafted = new Set(state.draftedPids)
  const card = pool.find(
    (c) => !drafted.has(c.pid) && theme.test(c) && resolveTypedPick(pool, c.name)?.pid === c.pid,
  )
  expect(card).toBeDefined()
  return card!
}

// A person with zero seasons passing the theme, resolvable by name.
function offThemeName(state: DraftState): string {
  const theme = themeById(state.theme!)
  const passing = new Set(pool.filter(theme.test).map((c) => c.pid))
  const card = pool.find((c) => !passing.has(c.pid) && resolveTypedPick(pool, c.name)?.pid === c.pid)
  expect(card).toBeDefined()
  return card!.name
}

describe('theme draft init', () => {
  it('deals ONE theme for the whole draft and starts in type mode with no board', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'type')
    expect(state.theme).not.toBeNull()
    expect(themeById(state.theme!).label.length).toBeGreaterThan(0)
    expect(initDraft('themes', HUMANS, 42, ctx, 'type').theme).toBe(state.theme)
    expect(state.offer).toBeNull()
    expect(state.teams.p1.strikesLeft).toBe(STRIKES_PER_PLAYER)
  })

  it('grid mode opens with a themed board of distinct people', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'grid')
    const theme = themeById(state.theme!)
    expect(state.offer).not.toBeNull()
    const cards = state.offer!.cards
    expect(cards.length).toBeGreaterThan(0)
    expect(new Set(cards.map((c) => c.pid)).size).toBe(cards.length)
    for (const card of cards) expect(theme.test(card)).toBe(true)
  })
})

describe('typed picks', () => {
  it('a valid call drafts that person’s best in-theme season and advances', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'type')
    const theme = themeById(state.theme!)
    const target = validTypedPick(state)
    const next = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: target.name }, ctx)

    expect(next.pickIndex).toBe(1)
    expect(next.draftedPids).toContain(target.pid)
    const drafted = rosterCards(next.teams.p1.roster)[0]
    expect(drafted.pid).toBe(target.pid)
    expect(theme.test(drafted)).toBe(true)
    // Best in-theme season: nothing of theirs in-theme rates higher.
    const better = pool.filter((c) => c.pid === target.pid && theme.test(c) && c.ovr > drafted.ovr)
    expect(better).toEqual([])
    expect(next.lastPick?.playerId).toBe('p1')
    expect(next.lastType).toBeNull()
  })

  it('an off-theme call burns a strike with feedback and no pick', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'type')
    const name = offThemeName(state)
    const next = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: name }, ctx)

    expect(next.pickIndex).toBe(0)
    expect(next.teams.p1.strikesLeft).toBe(STRIKES_PER_PLAYER - 1)
    expect(next.lastType?.outcome).toBe('off-theme')
    expect(next.lastType?.matchedName).toBe(name)
  })

  it('an already-drafted person is a strike', () => {
    let state = initDraft('themes', HUMANS, 42, ctx, 'type')
    const target = validTypedPick(state)
    state = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: target.name }, ctx)
    const next = applyAction(state, { type: 'TYPE_PICK', playerId: 'p2', query: target.name }, ctx)
    expect(next.teams.p2.strikesLeft).toBe(STRIKES_PER_PLAYER - 1)
    expect(next.lastType?.outcome).toBe('taken')
  })

  it('gibberish costs nothing', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'type')
    const next = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: 'xqzvw plork' }, ctx)
    expect(next.teams.p1.strikesLeft).toBe(STRIKES_PER_PLAYER)
    expect(next.lastType?.outcome).toBe('no-match')
  })

  it('three strikes opens the board, and the board still honors the theme', () => {
    let state = initDraft('themes', HUMANS, 42, ctx, 'type')
    const theme = themeById(state.theme!)
    const name = offThemeName(state)
    for (let i = 0; i < STRIKES_PER_PLAYER; i++) {
      expect(state.offer).toBeNull()
      state = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: name }, ctx)
    }
    expect(state.teams.p1.strikesLeft).toBe(0)
    expect(state.offer).not.toBeNull()
    for (const card of state.offer!.cards) expect(theme.test(card)).toBe(true)

    const take = state.offer!.cards[0]
    const next = applyAction(state, { type: 'TAKE', playerId: 'p1', cardId: take.id }, ctx)
    expect(next.pickIndex).toBe(1)
    expect(rosterCards(next.teams.p1.roster)[0].id).toBe(take.id)
  })

})

describe('full theme drafts', () => {
  it('an all-CPU type-mode draft completes with legal themed teams', () => {
    const state = advanceCpuTurns(initDraft('themes', CPUS, 7, ctx, 'type'), ctx)
    expect(state.done).toBe(true)
    for (const p of CPUS) {
      const cards = rosterCards(state.teams[p.id].roster)
      expect(cards.length).toBe(ROUNDS)
      expect(canFieldStarters(cards)).toBe(true)
      for (const slot of STARTER_SLOTS) expect(state.teams[p.id].roster[slot]).not.toBeNull()
    }
    const allPids = CPUS.flatMap((p) => rosterCards(state.teams[p.id].roster).map((c) => c.pid))
    expect(new Set(allPids).size).toBe(allPids.length)
  })

  it('an all-CPU grid-mode draft completes too', () => {
    const state = advanceCpuTurns(initDraft('themes', CPUS, 99, ctx, 'grid'), ctx)
    expect(state.done).toBe(true)
    for (const p of CPUS) {
      expect(canFieldStarters(rosterCards(state.teams[p.id].roster))).toBe(true)
    }
  })

  it('every non-fallback pick in a stepped draft honors the one theme', () => {
    let state = initDraft('themes', CPUS, 123, ctx, 'grid')
    const theme = themeById(state.theme!)
    while (!state.done) {
      const playerId = currentPlayerId(state)!
      const offer = state.offer!
      const fallback = offer.themeFallback === true
      const before = state.teams[playerId].roster
      state = applyAction(state, { type: 'TAKE', playerId, cardId: offer.cards[0].id }, ctx)
      const after = state.teams[playerId].roster
      const gained = rosterCards(after).find((c) => !rosterCards(before).some((b) => b.id === c.id))!
      if (!fallback) expect(theme.test(gained), `pick ${state.pickIndex} ${gained.name}`).toBe(true)
    }
  })
})
