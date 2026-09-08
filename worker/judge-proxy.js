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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// ------------------------------------------------------------ TURN relay
//
// PeerJS's built-in relays are gone, so rooms need one of their own.
// Cloudflare TURN credentials are minted here (the TURN key is a long-term
// secret and must never reach the browser). Setup, once, from worker/:
//   Cloudflare dashboard -> Realtime -> TURN -> create a key, then
//   npx wrangler secret put TURN_KEY_ID
//   npx wrangler secret put TURN_API_TOKEN
// Credentials live TURN_TTL seconds; one set is shared by every room that
// opens while it's fresh.
const TURN_TTL = 12 * 60 * 60
let turnCache = null // { body, fetchedAt }

async function turnCredentials(env, cors) {
  if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) return json({ error: 'turn not configured' }, 404, cors)
  const now = Date.now()
  if (turnCache && now - turnCache.fetchedAt < TURN_TTL * 1000 * 0.5) return json(turnCache.body, 200, cors)
  const upstream = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TURN_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: TURN_TTL }),
  })
  if (!upstream.ok) return json({ error: 'turn upstream error' }, 502, cors)
  const data = await upstream.json()
  if (!Array.isArray(data?.iceServers)) return json({ error: 'turn upstream malformed' }, 502, cors)
  const body = { iceServers: data.iceServers, ttl: TURN_TTL }
  turnCache = { body, fetchedAt: now }
  return json(body, 200, cors)
}

// ------------------------------------------------------------ room relay
//
// A WebSocket relay per room code, so friends reach each other over plain
// wss:// on 443 - no NAT punching, no TURN, works on any network. The host
// connects to /room/<CODE>/host, each guest to /room/<CODE>/guest/<id>,
// and the room's Durable Object forwards frames between them. The host's
// browser stays the game's only authority - this is a pipe, not a brain.
// Hibernation keeps idle rooms free. A host that drops has HOST_GRACE_MS
// to come back (guests stay attached) before the room is declared dead.
const HOST_GRACE_MS = 90_000
const ROOM_CODE = /^[A-Z0-9]{4}$/

export class RoomRelay {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 })
    const parts = new URL(request.url).pathname.split('/').filter(Boolean) // room, CODE, host|guest, id?
    const role = parts[2]
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    if (role === 'host') {
      for (const old of this.ctx.getWebSockets('host')) old.close(4000, 'replaced')
      this.ctx.acceptWebSocket(server, ['host'])
      server.serializeAttachment({ role: 'host' })
      await this.ctx.storage.deleteAlarm()
      // Re-announce everyone already in the room (a host coming back).
      for (const guest of this.ctx.getWebSockets('guest')) {
        const meta = guest.deserializeAttachment()
        if (meta?.id) server.send(JSON.stringify({ t: 'join', id: meta.id }))
      }
    } else if (role === 'guest' && typeof parts[3] === 'string' && parts[3].length > 0 && parts[3].length <= 64) {
      const id = parts[3]
      const hosts = this.ctx.getWebSockets('host')
      if (hosts.length === 0) {
        // Say why in a frame first: a close code racing the handshake can
        // reach some clients as a bare 1006.
        server.accept()
        server.send(JSON.stringify({ t: 'noroom' }))
        server.close(4004, 'no room')
        return new Response(null, { status: 101, webSocket: client })
      }
      for (const old of this.ctx.getWebSockets(`guest:${id}`)) old.close(4000, 'replaced')
      this.ctx.acceptWebSocket(server, ['guest', `guest:${id}`])
      server.serializeAttachment({ role: 'guest', id })
      for (const host of hosts) host.send(JSON.stringify({ t: 'join', id }))
    } else {
      return new Response('bad path', { status: 400 })
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(ws, raw) {
    const meta = ws.deserializeAttachment()
    let msg
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : '')
    } catch {
      return
    }
    if (!meta || !msg || typeof msg !== 'object') return
    if (meta.role === 'host') {
      if (msg.t === 'msg' && typeof msg.id === 'string') {
        const frame = JSON.stringify({ t: 'msg', data: msg.data })
        for (const guest of this.ctx.getWebSockets(`guest:${msg.id}`)) guest.send(frame)
      } else if (msg.t === 'close' && typeof msg.id === 'string') {
        for (const guest of this.ctx.getWebSockets(`guest:${msg.id}`)) guest.close(4001, 'closed by host')
      }
    } else if (meta.role === 'guest' && msg.t === 'msg') {
      const frame = JSON.stringify({ t: 'msg', id: meta.id, data: msg.data })
      for (const host of this.ctx.getWebSockets('host')) host.send(frame)
    }
  }

  async webSocketClose(ws) {
    const meta = ws.deserializeAttachment()
    if (meta?.role === 'host') {
      const others = this.ctx.getWebSockets('host').filter((s) => s !== ws)
      if (others.length === 0) await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS)
    } else if (meta?.role === 'guest') {
      const frame = JSON.stringify({ t: 'leave', id: meta.id })
      for (const host of this.ctx.getWebSockets('host')) host.send(frame)
    }
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws)
  }

  async alarm() {
    if (this.ctx.getWebSockets('host').length > 0) return
    for (const guest of this.ctx.getWebSockets('guest')) guest.close(4002, 'host gone')
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin') ?? '')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const path = new URL(request.url).pathname
    if (path.startsWith('/room/')) {
      const code = path.split('/')[2] ?? ''
      if (!ROOM_CODE.test(code)) return json({ error: 'bad room code' }, 400, cors)
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
      return stub.fetch(request)
    }
    if (path === '/turn') {
      if (request.method !== 'GET') return json({ error: 'GET only' }, 405, cors)
      return turnCredentials(env, cors)
    }
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
