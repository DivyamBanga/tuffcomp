import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import { STARTER_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import { cpuChooseTheme, type DraftCtx, type DraftPlayer } from './draft'
import { applyMatchAction, initMatch, type MatchState } from './match'

let ctx: DraftCtx

const SOLO: DraftPlayer[] = [
  { id: 'me', name: 'Div', isCpu: false },
  { id: 'cpu1', name: 'BOT A', isCpu: true },
]

beforeAll(async () => {
  const pool: Card[] = await loadCards()
  ctx = { pool }
})

function draftToCompletion(state: MatchState): MatchState {
  let current = state
  let guard = 0
  while (current.phase === 'draft' && guard++ < 100) {
    current = applyMatchAction(current, { type: 'DRAFT', action: cpuChooseTheme(current.draft!, ctx) }, ctx)
  }
  expect(current.phase).toBe('preview')
  return current
}

function simToEnd(state: MatchState): MatchState {
  let current = state
  let guard = 0
  while (current.phase !== 'done' && guard++ < 500) {
    current = applyMatchAction(current, { type: 'SIM_NEXT' }, ctx)
  }
  expect(current.phase).toBe('done')
  return current
}

describe('season format, solo vs CPU with fillers', () => {
  it('runs draft -> season -> playoffs -> champion end to end', () => {
    let state = initMatch({ mode: 'themes', format: 'season', leagueSize: 4, seed: 314, theme: 'era-90s' }, SOLO, ctx)
    state = draftToCompletion(state)

    expect(state.entries.length).toBe(4)
    expect(state.entries.filter((e) => e.isFiller).length).toBe(2)
    for (const entry of state.entries) {
      const roster = state.rosters[entry.id]
      for (const slot of STARTER_SLOTS) expect(roster[slot]).not.toBeNull()
    }

    state = applyMatchAction(state, { type: 'BEGIN_COMPETITION' }, ctx)
    expect(state.phase).toBe('season')
    expect(state.season!.schedule.length).toBe(12) // 4 teams double round robin

    state = simToEnd(state)
    expect(state.championId).not.toBeNull()
    expect(state.entries.map((e) => e.id)).toContain(state.championId)
    expect(state.seasonMvp).not.toBeNull()
    expect(state.finalsMvp).not.toBeNull()
    expect(state.playoffRounds.at(-1)!.name).toBe('THE FINALS')
  })

  it('is deterministic end to end for a fixed seed and action script', () => {
    const run = () => {
      let state = initMatch({ mode: 'themes', format: 'season', leagueSize: 4, seed: 42, theme: 'era-90s' }, SOLO, ctx)
      state = draftToCompletion(state)
      state = applyMatchAction(state, { type: 'BEGIN_COMPETITION' }, ctx)
      return simToEnd(state)
    }
    const a = run()
    const b = run()
    expect(a.championId).toBe(b.championId)
    expect(a.season!.standings).toEqual(b.season!.standings)
  })
})

describe('straight series format', () => {
  it('skips the season and crowns a champion through a bracket', () => {
    let state = initMatch({ mode: 'themes', format: 'series', leagueSize: 2, seed: 9, theme: 'era-90s' }, SOLO, ctx)
    state = draftToCompletion(state)
    state = applyMatchAction(state, { type: 'BEGIN_COMPETITION' }, ctx)
    expect(state.phase).toBe('playoffs')
    expect(state.season).toBeNull()
    expect(state.playoffRounds[0].name).toBe('THE FINALS')

    state = simToEnd(state)
    expect(state.championId).not.toBeNull()
    const finals = state.playoffRounds.at(-1)!.matchups[0]
    expect(finals.tally[state.championId!]).toBe(4)
  })

  it('four-team bracket plays semifinals then finals', () => {
    const players: DraftPlayer[] = [
      { id: 'p1', name: 'A', isCpu: false },
      { id: 'p2', name: 'B', isCpu: false },
      { id: 'p3', name: 'C', isCpu: false },
      { id: 'p4', name: 'D', isCpu: false },
    ]
    let state = initMatch({ mode: 'themes', format: 'series', leagueSize: 4, seed: 77, theme: 'era-90s' }, players, ctx)
    state = draftToCompletion(state)
    state = applyMatchAction(state, { type: 'BEGIN_COMPETITION' }, ctx)
    expect(state.playoffRounds[0].name).toBe('SEMIFINALS')
    expect(state.playoffRounds[0].matchups.length).toBe(2)
    state = simToEnd(state)
    expect(state.playoffRounds.length).toBe(2)
    expect(state.playoffRounds[1].name).toBe('THE FINALS')
  })
})

describe('positionless chase (7-footers only)', () => {
  it('drafts giants at every slot, generates the slate, and sims clean', () => {
    const me: DraftPlayer[] = [{ id: 'me', name: 'Div', isCpu: false }]
    let state = initMatch({ mode: 'themes', format: 'chase', leagueSize: 1, seed: 8, theme: 'bio-sevenfeet' }, me, ctx)
    expect(state.draft!.positionless).toBe(true)
    state = draftToCompletion(state)
    expect(state.positionless).toBe(true)
    expect(state.entries.filter((e) => e.isFiller).length).toBe(14)

    // Positionless moves: the 7-foot "PG" may swap anywhere pre-tipoff.
    const pg = state.rosters.me.PG!
    const moved = applyMatchAction(state, { type: 'MOVE_AFTER_DRAFT', playerId: 'me', from: 'PG', to: 'C' }, ctx)
    expect(moved.rosters.me.C!.id).toBe(pg.id)

    state = applyMatchAction(state, { type: 'BEGIN_COMPETITION' }, ctx)
    expect(state.phase).toBe('season')
    expect(state.season!.schedule.length).toBe(82)
    for (let i = 0; i < 5; i++) state = applyMatchAction(state, { type: 'SIM_NEXT' }, ctx)
    expect(state.season!.played.length).toBe(5)
  })
})

describe('party modes end to end', () => {
  it('a dollar-table party runs draft -> preview -> season -> champion with 5-man teams', async () => {
    const { feasibleBudgetPicks, budgetTurnId } = await import('./party')
    const players: DraftPlayer[] = [
      { id: 'p1', name: 'Div', isCpu: false },
      { id: 'p2', name: 'Jay', isCpu: false },
      { id: 'bot', name: 'BOT A', isCpu: true },
    ]
    let state = initMatch({ mode: 'budget', format: 'season', leagueSize: 4, seed: 21, theme: 'era-90s' }, players, ctx)
    expect(state.phase).toBe('draft')
    expect(state.party!.kind).toBe('budget')

    let guard = 0
    while (state.phase === 'draft' && guard++ < 30) {
      const party = state.party!
      if (party.kind !== 'budget') throw new Error('unexpected')
      const turn = budgetTurnId(party)!
      const pick = feasibleBudgetPicks(party, ctx, turn).sort((a, b) => b.card.ovr - a.card.ovr)[0]
      state = applyMatchAction(state, { type: 'PARTY', action: { type: 'BUDGET_PICK', playerId: turn, cardId: pick.card.id } }, ctx)
    }
    expect(state.phase).toBe('preview')
    // The room IS the league: three teams, no fillers.
    expect(state.entries.length).toBe(3)
    expect(state.entries.every((e) => !e.isFiller)).toBe(true)
    for (const p of players) {
      for (const slot of STARTER_SLOTS) expect(state.rosters[p.id][slot]).not.toBeNull()
      expect(state.rosters[p.id].B1).toBeNull()
    }

    // 5-man teams sim clean all the way to a ring.
    state = applyMatchAction(state, { type: 'BEGIN_COMPETITION' }, ctx)
    expect(state.phase).toBe('season')
    state = simToEnd(state)
    expect(state.championId).not.toBeNull()
    const finalGame = state.playoffRounds.at(-1)!.matchups[0].games[0]
    expect(finalGame.home.box.length).toBe(5)
    expect(finalGame.home.box.reduce((s, l) => s + l.pts, 0)).toBe(finalGame.home.score)
  })

  it('an auction party reaches preview via bids and the hammer', () => {
    const players: DraftPlayer[] = [
      { id: 'p1', name: 'Div', isCpu: false },
      { id: 'bot1', name: 'BOT A', isCpu: true },
      { id: 'bot2', name: 'BOT B', isCpu: true },
    ]
    let state = initMatch({ mode: 'auction', format: 'series', leagueSize: 2, seed: 33, theme: 'era-10s' }, players, ctx)
    expect(state.party!.kind).toBe('auction')

    let guard = 0
    while (state.phase === 'draft' && guard++ < 500) {
      const party = state.party!
      if (party.kind !== 'auction' || !party.lot) break
      // The human passes everything; bots and the clock do the rest.
      const passed = applyMatchAction(state, { type: 'PARTY', action: { type: 'AUCTION_PASS', playerId: 'p1' } }, ctx)
      state = passed !== state ? passed : applyMatchAction(state, { type: 'AUCTION_TICK' }, ctx)
    }
    expect(state.phase).toBe('preview')
    // The human's team was auto-filled by the safety net; bots bought theirs.
    for (const p of players) {
      for (const slot of STARTER_SLOTS) expect(state.rosters[p.id][slot], `${p.id} ${slot}`).not.toBeNull()
    }
  })

  it('preview MOVE cannot stash a 5-man starter on the empty bench', async () => {
    const { feasibleBudgetPicks, budgetTurnId } = await import('./party')
    const players: DraftPlayer[] = [
      { id: 'p1', name: 'Div', isCpu: false },
      { id: 'bot', name: 'BOT A', isCpu: true },
    ]
    let state = initMatch({ mode: 'budget', format: 'series', leagueSize: 2, seed: 5, theme: 'era-00s' }, players, ctx)
    let guard = 0
    while (state.phase === 'draft' && guard++ < 20) {
      const party = state.party!
      if (party.kind !== 'budget') throw new Error('unexpected')
      const turn = budgetTurnId(party)!
      const pick = feasibleBudgetPicks(party, ctx, turn)[0]
      state = applyMatchAction(state, { type: 'PARTY', action: { type: 'BUDGET_PICK', playerId: turn, cardId: pick.card.id } }, ctx)
    }
    expect(state.phase).toBe('preview')
    expect(applyMatchAction(state, { type: 'MOVE_AFTER_DRAFT', playerId: 'p1', from: 'PG', to: 'B1' }, ctx)).toBe(state)
  })
})

describe('preview-phase lineup moves', () => {
  it('lets a player legally rearrange and rejects illegal moves', () => {
    let state = initMatch({ mode: 'themes', format: 'series', leagueSize: 2, seed: 15, theme: 'era-90s' }, SOLO, ctx)
    state = draftToCompletion(state)

    const roster = state.rosters.me
    const pg = roster.PG!
    const moved = applyMatchAction(state, { type: 'MOVE_AFTER_DRAFT', playerId: 'me', from: 'PG', to: 'B1' }, ctx)
    const benchCard = roster.B1
    const benchCanRunPoint =
      benchCard === null ||
      ['PG', 'SG'].includes(benchCard.pos) ||
      benchCard.pos2 === 'PG' ||
      benchCard.pos2 === 'SG'
    if (benchCanRunPoint) {
      expect(moved.rosters.me.B1!.id).toBe(pg.id)
    } else {
      expect(moved).toBe(state)
    }

    const center = state.rosters.me.C!
    const centerCanRunPoint = ['PG', 'SG'].includes(center.pos) || center.pos2 === 'PG' || center.pos2 === 'SG'
    if (!centerCanRunPoint) {
      expect(applyMatchAction(state, { type: 'MOVE_AFTER_DRAFT', playerId: 'me', from: 'C', to: 'PG' }, ctx)).toBe(state)
    }
  })
})
