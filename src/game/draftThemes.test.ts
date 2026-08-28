import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import { canFieldStarters, emptyRoster, rosterCards, STARTER_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import {
  advanceCpuTurns,
  applyAction,
  autoPlace,
  cpuChooseTheme,
  currentPlayerId,
  initDraft,
  ROUNDS,
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
  it('deals ONE theme for the whole draft, no board, typing only', () => {
    const state = initDraft('themes', HUMANS, 42, ctx)
    expect(state.theme).not.toBeNull()
    expect(themeById(state.theme!).label.length).toBeGreaterThan(0)
    expect(initDraft('themes', HUMANS, 42, ctx).theme).toBe(state.theme)
    expect(state.offer).toBeNull()
    expect(state.whiffs).toEqual([])
  })

  it('honors a chosen theme', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'era-80s')
    expect(state.theme).toBe('era-80s')
    expect(state.positionless).toBe(false)
  })

  it('a position-locked theme deals as positionless', () => {
    const state = initDraft('themes', HUMANS, 42, ctx, 'bio-sevenfeet')
    expect(state.theme).toBe('bio-sevenfeet')
    expect(state.positionless).toBe(true)
  })
})

describe('typed picks (unlimited, no strikes)', () => {
  it('a valid call drafts that person’s best in-theme season and advances', () => {
    const state = initDraft('themes', HUMANS, 42, ctx)
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

  it('wrong calls cost nothing and pile into the whiff ledger, forever', () => {
    let state = initDraft('themes', HUMANS, 42, ctx)
    const name = offThemeName(state)

    // Ten straight whiffs: no strikes, no board, still your turn.
    for (let i = 0; i < 10; i++) {
      state = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: name }, ctx)
      expect(state.offer).toBeNull()
      expect(currentPlayerId(state)).toBe('p1')
    }
    expect(state.pickIndex).toBe(0)
    expect(state.lastType?.outcome).toBe('off-theme')
    expect(state.lastType?.matchedName).toBe(name)
    expect(state.lastType?.attempt).toBe(10)
    expect(state.whiffs.length).toBe(10)

    // And a valid call still lands afterward.
    const target = validTypedPick(state)
    const next = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: target.name }, ctx)
    expect(next.pickIndex).toBe(1)
    // The ledger survives the pick - the shame is permanent.
    expect(next.whiffs.length).toBe(10)
  })

  it('an already-drafted person and gibberish give distinct feedback', () => {
    let state = initDraft('themes', HUMANS, 42, ctx)
    const target = validTypedPick(state)
    state = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: target.name }, ctx)
    const taken = applyAction(state, { type: 'TYPE_PICK', playerId: 'p2', query: target.name }, ctx)
    expect(taken.lastType?.outcome).toBe('taken')
    const gibberish = applyAction(state, { type: 'TYPE_PICK', playerId: 'p2', query: 'xqzvw plork' }, ctx)
    expect(gibberish.lastType?.outcome).toBe('no-match')
  })

  it('the whiff ledger is capped', () => {
    let state = initDraft('themes', HUMANS, 42, ctx)
    const name = offThemeName(state)
    for (let i = 0; i < 30; i++) {
      state = applyAction(state, { type: 'TYPE_PICK', playerId: 'p1', query: name }, ctx)
    }
    expect(state.whiffs.length).toBeLessThanOrEqual(24)
  })
})

describe('full theme drafts', () => {
  it('an all-CPU typed draft completes with legal themed teams', () => {
    const state = advanceCpuTurns(initDraft('themes', CPUS, 7, ctx), ctx)
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

  it('every pick in a stepped draft honors the one theme', () => {
    let state = initDraft('themes', CPUS, 123, ctx)
    const theme = themeById(state.theme!)
    while (!state.done) {
      const playerId = currentPlayerId(state)!
      const fallback = state.offer?.themeFallback === true
      const before = state.teams[playerId].roster
      state = applyAction(state, cpuChooseTheme(state, ctx), ctx)
      const after = state.teams[playerId].roster
      const gained = rosterCards(after).find((c) => !rosterCards(before).some((b) => b.id === c.id))!
      if (!fallback) expect(theme.test(gained), `pick ${state.pickIndex} ${gained.name}`).toBe(true)
    }
  })

  it('a positionless draft fills all five slots in-theme with giants', () => {
    const state = advanceCpuTurns(initDraft('themes', CPUS, 5, ctx, 'bio-sevenfeet'), ctx)
    expect(state.done).toBe(true)
    const theme = themeById('bio-sevenfeet')
    for (const p of CPUS) {
      const roster = state.teams[p.id].roster
      for (const slot of STARTER_SLOTS) {
        expect(roster[slot], `${p.id} ${slot}`).not.toBeNull()
        // Every single pick fits the category - even the "point guard".
        expect(theme.test(roster[slot]!), `${p.id} ${slot} ${roster[slot]!.name}`).toBe(true)
      }
      expect(rosterCards(roster).length).toBe(ROUNDS)
    }
  })

  it('positionless placement matches skills to roles', () => {
    const empty = emptyRoster()
    // A playmaking giant runs the point; a rim god anchors the middle.
    const passer = pool.find((c) => c.name === 'Nikola Jokić' && c.season === 2024)!
    const rim = pool.find((c) => c.name === 'Victor Wembanyama' && c.season === 2026)!
    expect(autoPlace(empty, passer, false, true)).toBe('PG')
    expect(autoPlace(empty, rim, false, true)).toBe('C')
  })
})
