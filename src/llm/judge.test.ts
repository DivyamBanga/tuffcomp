import { describe, expect, it } from 'vitest'
import { makeRoster } from '../engine/testFixtures'
import { buildProfiles, applyMatchAction, initMatch, type MatchState } from '../game/match'
import { buildJudgePrompt, judgeAdjustments, parseJudgment, type LeagueJudgment } from './judge'

const ENTRIES = [
  { id: 't1', name: 'DIV' },
  { id: 't2', name: 'JAY' },
]

function judgment(offense1: number, offense2: number): LeagueJudgment {
  return {
    model: 'claude-haiku-4-5',
    teams: {
      t1: { offense: offense1, defense: 50, star: 50, cohesion: 50, blurb: 'a' },
      t2: { offense: offense2, defense: 50, star: 50, cohesion: 50, blurb: 'b' },
    },
  }
}

describe('buildJudgePrompt', () => {
  it('includes every team with ids, names, and stat lines', () => {
    const rosters = { t1: makeRoster(), t2: makeRoster() }
    const prompt = buildJudgePrompt(ENTRIES, rosters)
    expect(prompt).toContain('teamId: t1')
    expect(prompt).toContain('teamId: t2')
    expect(prompt).toContain('TEAM DIV')
    expect(prompt).toContain('OVR 80')
    expect(prompt).toContain('usage 20%')
  })
})

describe('parseJudgment', () => {
  const valid = JSON.stringify({
    teams: [
      { teamId: 't1', offense: 88, defense: 70, star: 95, cohesion: 60, blurb: 'Stacked.' },
      { teamId: 't2', offense: 55.6, defense: 140, star: -5, cohesion: 50, blurb: 'Thin.' },
    ],
  })

  it('accepts a full response and clamps scores to 0-100 integers', () => {
    const parsed = parseJudgment(valid, ['t1', 't2'])!
    expect(parsed.t1.offense).toBe(88)
    expect(parsed.t2.offense).toBe(56)
    expect(parsed.t2.defense).toBe(100)
    expect(parsed.t2.star).toBe(0)
  })

  it('rejects malformed JSON, missing teams, and bad score types', () => {
    expect(parseJudgment('not json', ['t1'])).toBeNull()
    expect(parseJudgment(valid, ['t1', 't2', 't3'])).toBeNull()
    expect(
      parseJudgment(JSON.stringify({ teams: [{ teamId: 't1', offense: 'high', defense: 1, star: 1, cohesion: 1, blurb: '' }] }), ['t1']),
    ).toBeNull()
  })
})

describe('judgeAdjustments', () => {
  it('centers on the league mean and caps the swing', () => {
    const adj = judgeAdjustments(judgment(100, 0), ['t1', 't2'])
    // offense delta vs mean is ±50 -> capped at ±4; star/cohesion equal -> 0
    expect(adj.get('t1')!.dOff).toBe(4)
    expect(adj.get('t2')!.dOff).toBe(-4)
    expect(adj.get('t1')!.dDef).toBe(0)
  })

  it('is zero for equal teams and for unrated teams', () => {
    const adj = judgeAdjustments(judgment(60, 60), ['t1', 't2', 'ghost'])
    expect(adj.get('t1')!.dOff).toBe(0)
    expect(adj.get('ghost')).toEqual({ dOff: 0, dDef: 0 })
  })
})

describe('SET_JUDGE in the match reducer', () => {
  function previewMatch(): MatchState {
    // Hand-build a preview-phase state; ctx is unused by SET_JUDGE.
    const base = initMatch(
      { mode: 'themes', format: 'series', leagueSize: 2, seed: 1 },
      [
        { id: 't1', name: 'DIV', isCpu: false },
        { id: 't2', name: 'JAY', isCpu: false },
      ],
      { pool: [] as never },
    )
    return { ...base, phase: 'preview', draft: null, rosters: { t1: makeRoster(), t2: makeRoster() } }
  }

  it('stores the judgment once, in preview only, and shifts sim profiles', () => {
    const state = previewMatch()
    const judged = applyMatchAction(state, { type: 'SET_JUDGE', judgment: judgment(100, 0) }, { pool: [] })
    expect(judged.judge).not.toBeNull()

    const again = applyMatchAction(judged, { type: 'SET_JUDGE', judgment: judgment(0, 100) }, { pool: [] })
    expect(again).toBe(judged)

    const plain = buildProfiles(state)
    const boosted = buildProfiles(judged)
    expect(boosted.get('t1')!.offense - plain.get('t1')!.offense).toBeCloseTo(4)
    expect(boosted.get('t2')!.offense - plain.get('t2')!.offense).toBeCloseTo(-4)
    expect(boosted.get('t1')!.defense).toBeCloseTo(plain.get('t1')!.defense)
  })
})
