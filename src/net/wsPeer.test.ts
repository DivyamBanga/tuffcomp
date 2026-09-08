import { beforeAll, describe, expect, it } from 'vitest'
import { loadCards } from '../data/loadCards'
import type { DraftCtx } from '../game/draft'
import type { MatchConfig, MatchState } from '../game/match'
import type { LobbySnapshot } from './protocol'
import { GuestRoom, HostRoom } from './room'
import { relayPeerFactory, type WebSocketCtor } from './wsPeer'

// An in-memory stand-in for the Worker's RoomRelay Durable Object: the
// same URL shapes, the same frames, the same close codes. Everything the
// real relay does on the wire, this does synchronously in memory.

type Listener = ((ev: never) => void) | null

class FakeSocket {
  readyState = 0
  onopen: Listener = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: { code: number }) => void) | null = null
  onerror: Listener = null
  url: string
  private relay: FakeRelay
  constructor(url: string, relay: FakeRelay) {
    this.url = url
    this.relay = relay
    // Connect on the next microtask, like a real socket.
    queueMicrotask(() => relay.attach(this))
  }
  send(data: string) {
    this.relay.frame(this, data)
  }
  close(code = 1000) {
    if (this.readyState === 3) return
    this.readyState = 3
    this.relay.detach(this)
    this.onclose?.({ code })
  }
  // Relay-side helpers
  open() {
    this.readyState = 1
    this.onopen?.(undefined as never)
  }
  deliver(frame: string) {
    this.onmessage?.({ data: frame })
  }
  serverClose(code: number) {
    if (this.readyState === 3) return
    this.readyState = 3
    this.onclose?.({ code })
  }
}

function socketCtorFor(relay: FakeRelay): WebSocketCtor {
  return class extends FakeSocket {
    constructor(url: string) {
      super(url, relay)
    }
  } as unknown as WebSocketCtor
}

class FakeRelay {
  private hosts = new Map<string, FakeSocket>() // code -> host socket
  private guests = new Map<string, Map<string, FakeSocket>>() // code -> id -> socket
  socketCtor(): WebSocketCtor {
    return socketCtorFor(this)
  }
  private parseUrl(url: string) {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    return { code: parts[1], role: parts[2], id: parts[3] }
  }
  attach(sock: FakeSocket) {
    const { code, role, id } = this.parseUrl(sock.url)
    if (role === 'host') {
      this.hosts.get(code)?.serverClose(4000)
      this.hosts.set(code, sock)
      sock.open()
      for (const gid of this.guests.get(code)?.keys() ?? []) sock.deliver(JSON.stringify({ t: 'join', id: gid }))
      return
    }
    const host = this.hosts.get(code)
    if (!host) {
      sock.open()
      sock.deliver(JSON.stringify({ t: 'noroom' }))
      sock.serverClose(4004)
      return
    }
    if (!this.guests.has(code)) this.guests.set(code, new Map())
    this.guests.get(code)!.set(id, sock)
    // Like the real relay: the host hears 'join' before the guest can
    // send a single frame.
    host.deliver(JSON.stringify({ t: 'join', id }))
    sock.open()
  }
  frame(from: FakeSocket, raw: string) {
    const { code, role, id } = this.parseUrl(from.url)
    const msg = JSON.parse(raw)
    if (role === 'host') {
      const guest = this.guests.get(code)?.get(msg.id)
      if (msg.t === 'msg') guest?.deliver(JSON.stringify({ t: 'msg', data: msg.data }))
      if (msg.t === 'close') guest?.serverClose(4001)
      return
    }
    if (msg.t === 'msg') this.hosts.get(code)?.deliver(JSON.stringify({ t: 'msg', id, data: msg.data }))
  }
  detach(sock: FakeSocket) {
    const { code, role, id } = this.parseUrl(sock.url)
    if (role === 'host') {
      if (this.hosts.get(code) === sock) this.hosts.delete(code)
      return // guests stay attached: the host may come back
    }
    this.guests.get(code)?.delete(id)
    this.hosts.get(code)?.deliver(JSON.stringify({ t: 'leave', id }))
  }
  // Simulate the host's network dropping (the relay sees the socket go).
  dropHost(code: string) {
    const sock = this.hosts.get(code)
    if (!sock) return
    this.hosts.delete(code)
    sock.serverClose(1006)
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

let ctx: DraftCtx
const CONFIG: MatchConfig = { mode: 'themes', format: 'series', leagueSize: 2, seed: 5, theme: 'era-90s' }

beforeAll(async () => {
  ctx = { pool: await loadCards() }
})

function host(relay: FakeRelay) {
  let lobby: LobbySnapshot | null = null
  let match: MatchState | null = null
  const status: boolean[] = []
  const errors: string[] = []
  const room = new HostRoom(
    relayPeerFactory('https://relay.test', relay.socketCtor()),
    'ABCD',
    { playerId: 'host-1', name: 'Div' },
    CONFIG,
    ctx,
    {
      onSnapshot: (l, m) => {
        lobby = l
        match = m
      },
      onBrokerStatus: (o) => status.push(o),
      onError: (m) => errors.push(m),
    },
  )
  return { room, lobby: () => lobby!, match: () => match, status, errors }
}

function guest(relay: FakeRelay, code: string, playerId: string, name: string) {
  let lobby: LobbySnapshot | null = null
  let match: MatchState | null = null
  let welcomed = false
  let error: string | null = null
  const stages: string[] = []
  const room = new GuestRoom(relayPeerFactory('https://relay.test', relay.socketCtor()), code, { playerId, name }, {
    onSnapshot: (l, m) => {
      lobby = l
      match = m
    },
    onStage: (s) => stages.push(s),
    onWelcome: () => {
      welcomed = true
    },
    onRejected: (r) => {
      error = r
    },
    onError: (m) => {
      error = m
    },
  })
  return { room, lobby: () => lobby!, match: () => match, welcomed: () => welcomed, error: () => error, stages }
}

describe('rooms over the WebSocket relay', () => {
  it('host and guests handshake and play through the relay', async () => {
    const relay = new FakeRelay()
    const h = host(relay)
    await flush()
    expect(h.status).toEqual([true])
    const g1 = guest(relay, 'ABCD', 'guest-1', 'Jay')
    const g2 = guest(relay, 'ABCD', 'guest-2', 'Sam')
    await flush()
    expect(g1.welcomed()).toBe(true)
    expect(g2.welcomed()).toBe(true)
    expect(g1.stages).toEqual(['handshake'])
    expect(h.lobby().players.map((p) => p.name)).toEqual(['Div', 'Jay', 'Sam'])
    expect(g2.lobby().players.length).toBe(3)

    // Actions travel guest -> host, snapshots host -> guests.
    h.room.startMatch()
    await flush()
    expect(g1.match()!.phase).toBe('draft')
    expect(g1.match()!.draft!.order[0]).toBe('host-1')
    g1.room.sendAction({ type: 'DRAFT', action: { type: 'TYPE_PICK', playerId: 'guest-1', query: 'Michael Jordan' } })
    await flush()
    expect(h.match()!.draft!.pickIndex).toBe(0) // not their turn: the host authority still rules
    h.room.destroy()
  })

  it('a guest dialing a room nobody opened is told plainly', async () => {
    const relay = new FakeRelay()
    const g = guest(relay, 'ZZZZ', 'guest-1', 'Jay')
    await flush()
    expect(g.welcomed()).toBe(false)
    expect(g.error()).toBe("That room isn't open. Check the code with the host.")
  })

  it('a host that loses its socket comes back to the same guests', async () => {
    const relay = new FakeRelay()
    const h = host(relay)
    await flush()
    const g1 = guest(relay, 'ABCD', 'guest-1', 'Jay')
    await flush()
    expect(g1.welcomed()).toBe(true)

    relay.dropHost('ABCD')
    expect(h.status).toEqual([true, false])
    expect(h.room.online).toBe(false)
    // The guest's socket is untouched; the host reconnects and the relay
    // re-announces the guest, which the host already knows.
    h.room.reconnectNow()
    await flush()
    expect(h.room.online).toBe(true)
    expect(h.status).toEqual([true, false, true])
    expect(h.errors).toEqual([])
    h.room.addCpu('BOT A')
    await flush()
    expect(g1.lobby().players.some((p) => p.isCpu)).toBe(true) // still wired to the same guest
    // And a brand-new guest can join the reopened room.
    const g2 = guest(relay, 'ABCD', 'guest-2', 'Sam')
    await flush()
    expect(g2.welcomed()).toBe(true)
    expect(h.lobby().players.map((p) => p.name)).toEqual(['Div', 'Jay', 'BOT A', 'Sam'])
    h.room.destroy()
  })

  it('a guest leaving frees the pipe; the host sees the close', async () => {
    const relay = new FakeRelay()
    const h = host(relay)
    await flush()
    const g1 = guest(relay, 'ABCD', 'guest-1', 'Jay')
    await flush()
    g1.room.destroy()
    await flush()
    // Seat is kept (rejoinable), pipe is gone: a rejoin by the same id works.
    const again = guest(relay, 'ABCD', 'guest-1', 'Jay')
    await flush()
    expect(again.welcomed()).toBe(true)
    expect(h.lobby().players.filter((p) => p.id === 'guest-1').length).toBe(1)
    h.room.destroy()
  })
})
