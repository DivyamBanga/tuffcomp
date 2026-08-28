// RING CHASERS judge proxy - a tiny Cloudflare Worker that holds the
// Anthropic API key as a server-side secret so the public site never
// ships it. The client sends the drafted rosters prompt; everything that
// costs money (model, token budget, system prompt, output schema) is
// pinned HERE, so the endpoint is only usable as a basketball scout.
//
// Deploy (once, from worker/):
//   npx wrangler login
//   npx wrangler deploy
//   npx wrangler secret put ANTHROPIC_API_KEY   (paste the key)
// Local dev: put ANTHROPIC_API_KEY=... in worker/.dev.vars (gitignored),
// then: npx wrangler dev
//
// Keep MODEL, MAX_TOKENS, SYSTEM_PROMPT, and SCHEMA in sync with
// src/llm/judge.ts.

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 8000
const MAX_PROMPT_CHARS = 26000
const MAX_TEAMS = 16

const ALLOWED_ORIGINS = ['https://divyambanga.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']

const SYSTEM_PROMPT = `You are the veteran head scout for a fantasy league of drafted all-time NBA player-seasons. Rate every team RELATIVE TO THE OTHER TEAMS IN THIS LEAGUE ONLY.

Judge like a real front office:
- Star power decides playoff series: weigh each team's best two or three players heavily.
- Offense needs shooting and spacing around its scorers, and real playmaking to feed them.
- There is only one ball: several 30%+ usage scorers on one roster clash and lose value; check each team's five-man usage total.
- Defense travels: perimeter defense, rim protection, and rebounding win ugly games.
- Fit and cohesion matter: complementary roles, positional balance, real-life teammates (the listed real duos actually played together), and a shared era lift a roster; a pile of redundant stars does not.
- Use the league's theme for context. If the league is marked POSITIONLESS, judge lineups by skill roles, not listed positions - a playmaking giant running point is a feature.
- Pre-1980 seasons had no three-point line and thinner stat tracking; judge those players by dominance in their own time, not missing threes.

Score each team 0-100 on: offense, defense, star (star power ceiling), cohesion (fit and role balance). Spread the scores honestly - the best team in a category should land near 90+, the weakest near 40 or below. Write each blurb as one punchy scouting sentence under 120 characters, plain language, at most one player name.`

const SCHEMA = {
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
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
  }
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin') ?? '')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors)

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'bad json' }, 400, cors)
    }

    const prompt = typeof body?.prompt === 'string' ? body.prompt : ''
    const teamIds = Array.isArray(body?.teamIds) ? body.teamIds.filter((x) => typeof x === 'string') : []
    // Only judge-shaped requests get through to the paid API. Chase mode
    // sends up to 15 teams (you plus the whole slate).
    if (
      !prompt.startsWith('Here are the') ||
      prompt.length > MAX_PROMPT_CHARS ||
      teamIds.length < 2 ||
      teamIds.length > MAX_TEAMS
    ) {
      return json({ error: 'not a judge request' }, 400, cors)
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      }),
    })

    if (!upstream.ok) return json({ error: 'upstream error' }, 502, cors)
    const data = await upstream.json()
    if (data?.stop_reason === 'refusal') return json({ error: 'refused' }, 502, cors)
    const text = (data?.content ?? []).find((block) => block?.type === 'text')?.text ?? ''
    if (!text) return json({ error: 'empty' }, 502, cors)
    return json({ model: data.model ?? MODEL, text }, 200, cors)
  },
}
