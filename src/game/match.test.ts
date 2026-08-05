import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import { STARTER_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import { cpuChoose, type DraftCtx, type DraftPlayer } from './draft'
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
    current = applyMatchAction(current, { type: 'DRAFT', action: cpuChoose(current.draft!) }, ctx)
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
    let state = initMatch({ mode: 'themes', format: 'season', leagueSize: 4, seed: 314, input: 'grid' }, SOLO, ctx)
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
      let state = initMatch({ mode: 'themes', format: 'season', leagueSize: 4, seed: 42, input: 'grid' }, SOLO, ctx)
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
    let state = initMatch({ mode: 'themes', format: 'series', leagueSize: 2, seed: 9, input: 'grid' }, SOLO, ctx)
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
    let state = initMatch({ mode: 'themes', format: 'series', leagueSize: 4, seed: 77, input: 'grid' }, players, ctx)
    state = draftToCompletion(state)
    state = applyMatchAction(state, { type: 'BEGIN_COMPETITION' }, ctx)
    expect(state.playoffRounds[0].name).toBe('SEMIFINALS')
    expect(state.playoffRounds[0].matchups.length).toBe(2)
    state = simToEnd(state)
    expect(state.playoffRounds.length).toBe(2)
    expect(state.playoffRounds[1].name).toBe('THE FINALS')
  })
})

describe('preview-phase lineup moves', () => {
  it('lets a player legally rearrange and rejects illegal moves', () => {
    let state = initMatch({ mode: 'themes', format: 'series', leagueSize: 2, seed: 15, input: 'grid' }, SOLO, ctx)
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
