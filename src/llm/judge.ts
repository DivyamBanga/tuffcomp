import type { Card } from '../types'
import { ALL_SLOTS, type Roster } from '../engine/lineup'

// ----------------------------------------------------------------- the key
//
// Two ways the scout gets credentials, tried in this order:
// 1. The judge proxy: a tiny Cloudflare Worker (worker/) that holds the
//    real key as a server-side secret. Only its public URL is baked into
//    the bundle, so everyone gets the scout and the key never ships.
// 2. A personal key in localStorage on this machine only: never in git,
//    never in the bundle, never sent to peers, never logged.

const PROXY_URL = ((import.meta.env?.VITE_JUDGE_PROXY_URL as string | undefined) ?? '').trim()

export function judgeViaProxy(): boolean {
  return PROXY_URL.length > 0
}

export function judgeAvailable(): boolean {
  return judgeViaProxy() || hasJudgeKey()
}

const KEY_STORAGE = 'ringchasers:anthropicKey'

export function savedJudgeKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE)
  } catch {
    return null
  }
}

export function saveJudgeKey(key: string) {
  try {
    localStorage.setItem(KEY_STORAGE, key.trim())
  } catch {
    // storage unavailable - the judge just won't arm
  }
}

export function clearJudgeKey() {
  try {
    localStorage.removeItem(KEY_STORAGE)
  } catch {
    // ignore
  }
}

export function hasJudgeKey(): boolean {
  return (savedJudgeKey() ?? '').length > 0
}

// ------------------------------------------------------------------ types

// Keep model and token budget in sync with worker/judge-proxy.js.
export const JUDGE_MODEL = 'claude-sonnet-5'
const JUDGE_MAX_TOKENS = 4000

export interface TeamJudgment {
  offense: number
  defense: number
  star: number
  cohesion: number
  blurb: string
}

// One scouting report for the whole league, produced by a single model
// call after the draft. Serializable - the host broadcasts it in snapshots.
export interface LeagueJudgment {
  model: string
  teams: Record<string, TeamJudgment>
}

// ----------------------------------------------------------------- prompt

const SYSTEM_PROMPT = `You are the veteran head scout for a fantasy league of drafted all-time NBA player-seasons. Rate every team RELATIVE TO THE OTHER TEAMS IN THIS LEAGUE ONLY.

Judge like a real front office:
- Star power decides playoff series: weigh each team's best two or three players heavily.
- Offense needs shooting and spacing around its scorers, and real playmaking to feed them.
- There is only one ball: several 30%+ usage scorers on one roster clash and lose value.
- Defense travels: perimeter defense, rim protection, and rebounding win ugly games.
- Fit and cohesion matter: complementary roles, positional balance, and shared eras or real-life teammates lift a roster; a pile of redundant stars does not.

Score each team 0-100 on: offense, defense, star (star power ceiling), cohesion (fit and role balance). Spread the scores honestly - the best team in a category should land near 90+, the weakest near 40 or below. Write each blurb as one punchy scouting sentence under 120 characters, plain language, at most one player name.`

function cardLine(slot: string, card: Card | null): string {
  if (!card) return `  ${slot}: empty`
  const a = card.attrs
  return `  ${slot}: '${String(card.season).slice(2)} ${card.name} | OVR ${card.ovr} | ${card.stats.pts}p ${card.stats.reb}r ${card.stats.ast}a | 3P ${card.stats.tp}% | usage ${card.usg}% | scoring ${a.sc} shooting ${a.sh} playmaking ${a.pm} rebounding ${a.rb} defense ${a.df} rim ${a.rm}`
}

export function buildJudgePrompt(entries: { id: string; name: string }[], rosters: Record<string, Roster>): string {
  const teams = entries.map((entry) => {
    const roster = rosters[entry.id]
    const lines = ALL_SLOTS.map((slot) => cardLine(slot, roster[slot]))
    return `TEAM ${entry.name} (teamId: ${entry.id})\n${lines.join('\n')}`
  })
  return `Here are the ${entries.length} drafted teams. Slots PG-C are the starting five; B1-B3 are bench.\n\n${teams.join('\n\n')}\n\nRate every team.`
}

// Strict schema so the model cannot return malformed JSON.
export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['teams'],
  properties: {
    teams: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['teamId', 'offense', 'defense', 'star', 'cohesion', 'blurb'],
        properties: {
          teamId: { type: 'string' },
          offense: { type: 'integer' },
          defense: { type: 'integer' },
          star: { type: 'integer' },
          cohesion: { type: 'integer' },
          blurb: { type: 'string' },
        },
      },
    },
  },
} as const

// ------------------------------------------------------------------ parse

const clamp100 = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null

// Every expected team must come back with sane scores, or the whole
// judgment is discarded and the deterministic engine carries the game.
export function parseJudgment(text: string, expectedIds: string[]): Record<string, TeamJudgment> | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const teams = (raw as { teams?: unknown })?.teams
  if (!Array.isArray(teams)) return null

  const result: Record<string, TeamJudgment> = {}
  for (const item of teams) {
    const entry = item as Record<string, unknown>
    const id = typeof entry.teamId === 'string' ? entry.teamId : null
    const offense = clamp100(entry.offense)
    const defense = clamp100(entry.defense)
    const star = clamp100(entry.star)
    const cohesion = clamp100(entry.cohesion)
    if (!id || offense === null || defense === null || star === null || cohesion === null) continue
    result[id] = {
      offense,
      defense,
      star,
      cohesion,
      blurb: typeof entry.blurb === 'string' ? entry.blurb.slice(0, 160) : '',
    }
  }
  return expectedIds.every((id) => id in result) ? result : null
}

// ------------------------------------------------------------------ blend
//
// The judgment nudges the deterministic sim, never replaces it. Scores are
// centered on the league mean and capped, so even a wild judgment can only
// swing a team a few points per game - fair always.

const CAP_MAIN = 4
const CAP_SIDE = 2

const clampAbs = (n: number, cap: number) => Math.max(-cap, Math.min(cap, n))

export interface JudgeAdjustment {
  dOff: number
  dDef: number
}

export function judgeAdjustments(judgment: LeagueJudgment, teamIds: string[]): Map<string, JudgeAdjustment> {
  const rated = teamIds.filter((id) => judgment.teams[id])
  const mean = (pick: (t: TeamJudgment) => number) =>
    rated.length === 0 ? 0 : rated.reduce((sum, id) => sum + pick(judgment.teams[id]), 0) / rated.length

  const meanOff = mean((t) => t.offense)
  const meanDef = mean((t) => t.defense)
  const meanStar = mean((t) => t.star)
  const meanCoh = mean((t) => t.cohesion)

  const out = new Map<string, JudgeAdjustment>()
  for (const id of teamIds) {
    const t = judgment.teams[id]
    if (!t) {
      out.set(id, { dOff: 0, dDef: 0 })
      continue
    }
    out.set(id, {
      dOff: clampAbs((t.offense - meanOff) * 0.2, CAP_MAIN) + clampAbs((t.star - meanStar) * 0.1, CAP_SIDE),
      dDef: clampAbs((t.defense - meanDef) * 0.2, CAP_MAIN) + clampAbs((t.cohesion - meanCoh) * 0.1, CAP_SIDE),
    })
  }
  return out
}

// ------------------------------------------------------------------- call

// One Sonnet call per league, after the draft: through the proxy when one
// is configured (no key needed by anyone), else straight from this browser
// with the locally saved key. Any failure returns null - the game silently
// falls back to the built-in engine.
export async function judgeLeague(
  entries: { id: string; name: string }[],
  rosters: Record<string, Roster>,
): Promise<LeagueJudgment | null> {
  const prompt = buildJudgePrompt(entries, rosters)
  const ids = entries.map((e) => e.id)

  if (judgeViaProxy()) {
    const viaProxy = await judgeThroughProxy(prompt, ids)
    if (viaProxy) return viaProxy
  }
  return judgeDirect(prompt, ids)
}

async function judgeThroughProxy(prompt: string, ids: string[]): Promise<LeagueJudgment | null> {
  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, teamIds: ids }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { model?: string; text?: string }
    if (typeof data.text !== 'string') return null
    const teams = parseJudgment(data.text, ids)
    return teams ? { model: typeof data.model === 'string' ? data.model : JUDGE_MODEL, teams } : null
  } catch {
    return null
  }
}

async function judgeDirect(prompt: string, ids: string[]): Promise<LeagueJudgment | null> {
  const apiKey = savedJudgeKey()
  if (!apiKey) return null
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: 1,
      timeout: 60_000,
    })
    const response = await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: JUDGE_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: JUDGE_SCHEMA } },
    })
    const text = response.content.find((block) => block.type === 'text')?.text ?? ''
    const teams = parseJudgment(text, ids)
    return teams ? { model: response.model, teams } : null
  } catch {
    return null
  }
}
