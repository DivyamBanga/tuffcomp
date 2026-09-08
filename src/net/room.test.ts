import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadCards } from '../data/loadCards'
import { cpuChooseTheme, type DraftCtx } from '../game/draft'
import type { MatchConfig, MatchState } from '../game/match'
import { makeRoomCode, normalizeRoomCode, peerIdForCode, type LobbySnapshot } from './protocol'
import { GuestRoom, HostRoom, type PeerFactory, type WireConnection, type WirePeer } from './room'

// ------------------------------------------------- in-memory fake network

type Handler = (data: unknown) => void

class FakeWire implements WireConnection {
  other: FakeWire | null = null
  private dataHandlers: Handler[] = []
  private closeHandlers: (() => void)[] = []
  private errorHandlers: ((err: Error) => void)[] = []
  send(data: unknown) {
    // Structured-clone through JSON, like the real wire - catches any
    // non-serializable state sneaking into snapshots.
    const cloned = JSON.parse(JSON.stringify(data))
    for (const h of this.other?.dataHandlers ?? []) h(cloned)
  }
  onData(handler: Handler) {
    this.dataHandlers.push(handler)
  }
  onClose(handler: () => void) {
    this.closeHandlers.push(handler)
  }
  onError(handler: (err: Error) => void) {
    this.errorHandlers.push(handler)
  }
  // What PeerJS does when ICE fails on a connection that never opened:
  // an 'error', and NO 'close'.
  failNegotiation() {
    for (const h of this.errorHandlers) h(new Error("Couldn't reach the host"))
  }
  close() {
    for (const h of this.closeHandlers) h()
    for (const h of this.other?.closeHandlers ?? []) h()
  }
}

class FakePeer implements WirePeer {
  private openHandlers: ((id: string) => void)[] = []
  private connHandlers: ((conn: WireConnection) => void)[] = []
  private errorHandlers: ((err: Error) => void)[] = []
  private disconnectHandlers: (() => void)[] = []
  private registry: Map<string, FakePeer>
  private id: string
  reconnectCalls = 0
  // Simulate a broker that still holds our stale registration: the next
  // N reconnects bounce with "ID is taken" (error + disconnected again).
  reconnectRejections = 0
  constructor(registry: Map<string, FakePeer>, id: string) {
    this.registry = registry
    this.id = id
    registry.set(id, this)
  }
  onOpen(handler: (id: string) => void) {
    this.openHandlers.push(handler)
    handler(this.id) // immediately open
  }
  onConnection(handler: (conn: WireConnection) => void) {
    this.connHandlers.push(handler)
  }
  onError(handler: (err: Error) => void) {
    this.errorHandlers.push(handler)
  }
  onDisconnected(handler: () => void) {
    this.disconnectHandlers.push(handler)
  }
  // The broker socket died (PeerJS: 'disconnected', no auto-reconnect).
  dropBroker() {
    this.registry.delete(this.id)
    for (const h of this.disconnectHandlers) h()
  }
  reconnect() {
    this.reconnectCalls++
    if (this.reconnectRejections > 0) {
      this.reconnectRejections--
      for (const h of this.errorHandlers) h(new Error(`ID "${this.id}" is taken`))
      for (const h of this.disconnectHandlers) h()
      return
    }
    this.registry.set(this.id, this)
    for (const h of this.openHandlers) h(this.id)
  }
  connect(peerId: string): WireConnection {
    const target = this.registry.get(peerId)
    if (!target) throw new Error(`no peer ${peerId}`)
    const mine = new FakeWire()
    const theirs = new FakeWire()
    mine.other = theirs
    theirs.other = mine
    for (const h of target.connHandlers) h(theirs)
    return mine
  }
  destroy() {
    this.registry.delete(this.id)
  }
}

function makeFakeNetwork(): PeerFactory {
  const registry = new Map<string, FakePeer>()
  let anon = 0
  return (peerId?: string) => new FakePeer(registry, peerId ?? `anon-${anon++}`)
}

// ------------------------------------------------------------------ setup

let ctx: DraftCtx
const CONFIG: MatchConfig = { mode: 'themes', format: 'series', leagueSize: 2, seed: 5, theme: 'era-90s' }

beforeAll(async () => {
  ctx = { pool: await loadCards() }
})

function makeRoom(factory: PeerFactory) {
  let hostLobby: LobbySnapshot | null = null
  let hostMatch: MatchState | null = null
  let typing: { playerId: string; text: string } | null = null
  const host = new HostRoom(
    factory,
    'TEST',
    { playerId: 'host-1', name: 'Div' },
    CONFIG,
    ctx,
    {
      onSnapshot: (lobby, match) => {
        hostLobby = lobby
        hostMatch = match
      },
      onTyping: (playerId, text) => {
        typing = { playerId, text }
      },
      onError: () => {},
    },
  )
  return { host, hostLobby: () => hostLobby!, hostMatch: () => hostMatch, typing: () => typing }
}

function joinRoom(factory: PeerFactory, playerId: string, name: string) {
  let lobby: LobbySnapshot | null = null
  let match: MatchState | null = null
  let welcomed = false
  let rejection: string | null = null
  let typing: { playerId: string; text: string } | null = null
  const guest = new GuestRoom(factory, 'TEST', { playerId, name }, {
    onSnapshot: (l, m) => {
      lobby = l
      match = m
    },
    onTyping: (pid, text) => {
      typing = { playerId: pid, text }
    },
    onWelcome: () => {
      welcomed = true
    },
    onRejected: (reason) => {
      rejection = reason
    },
    onError: () => {},
  })
  return {
    guest,
    lobby: () => lobby!,
    match: () => match,
    welcomed: () => welcomed,
    rejection: () => rejection,
    typing: () => typing,
  }
}

// ------------------------------------------------------------------ tests

describe('room codes', () => {
  it('generates 4-char codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 30; i++) {
      const code = makeRoomCode()
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/)
    }
  })

  it('normalizes sloppy input', () => {
    expect(normalizeRoomCode(' ab-c7 ')).toBe('ABC7')
    expect(peerIdForCode('ABC7')).toContain('ABC7')
  })
})

describe('host + guests over the fake wire', () => {
  it('handshakes, seats guests, and broadcasts lobby snapshots', () => {
    const factory = makeFakeNetwork()
    const room = makeRoom(factory)
    const g1 = joinRoom(factory, 'guest-1', 'Jay')
    const g2 = joinRoom(factory, 'guest-2', 'Sam')

    expect(g1.welcomed()).toBe(true)
    expect(g2.welcomed()).toBe(true)
    expect(room.hostLobby().players.map((p) => p.name)).toEqual(['Div', 'Jay', 'Sam'])
    expect(g2.lobby().players.length).toBe(3)
    room.host.destroy()
  })

  it('runs a full online draft with turn enforcement', () => {
    const factory = makeFakeNetwork()
    const room = makeRoom(factory)
    const g1 = joinRoom(factory, 'guest-1', 'Jay')

    room.host.startMatch()
    const match = () => room.hostMatch()!
    expect(match().phase).toBe('draft')
    expect(match().draft!.order[0]).toBe('host-1')

    // Guest tries to act out of turn - rejected by the host authority.
    g1.guest.sendAction({
      type: 'DRAFT',
      action: { type: 'TYPE_PICK', playerId: 'guest-1', query: 'Michael Jordan' },
    })
    expect(match().draft!.pickIndex).toBe(0)

    // Guest also can't spoof the host's playerId (sender mismatch).
    g1.guest.sendAction({
      type: 'DRAFT',
      action: { type: 'TYPE_PICK', playerId: 'host-1', query: 'Michael Jordan' },
    })
    expect(match().draft!.pickIndex).toBe(0)

    // Play the whole draft out alternating properly via each side's channel.
    let guard = 0
    while (match().phase === 'draft' && guard++ < 60) {
      const draft = match().draft!
      const turn = draft.order[draft.pickIndex]
      const action = cpuChooseTheme(draft, ctx)
      if (turn === 'host-1') room.host.dispatchFrom('host-1', { type: 'DRAFT', action })
      else g1.guest.sendAction({ type: 'DRAFT', action })
    }
    expect(match().phase).toBe('preview')
    expect(g1.match()!.phase).toBe('preview')

    // Only the host can begin and sim.
    g1.guest.sendAction({ type: 'BEGIN_COMPETITION' })
    expect(match().phase).toBe('preview')
    room.host.dispatchFrom('host-1', { type: 'BEGIN_COMPETITION' })
    expect(match().phase).toBe('playoffs')

    guard = 0
    while (match().phase !== 'done' && guard++ < 40) {
      room.host.dispatchFrom('host-1', { type: 'SIM_NEXT' })
    }
    expect(match().phase).toBe('done')
    expect(g1.match()!.championId).toBe(match().championId)
    room.host.destroy()
  })

  it('rejects new joins after the game starts but lets a seated player rejoin', () => {
    const factory = makeFakeNetwork()
    const room = makeRoom(factory)
    joinRoom(factory, 'guest-1', 'Jay')
    room.host.startMatch()

    const stranger = joinRoom(factory, 'guest-9', 'Late Larry')
    expect(stranger.rejection()).toBe('Game already started')

    const rejoin = joinRoom(factory, 'guest-1', 'Jay')
    expect(rejoin.welcomed()).toBe(true)
    expect(rejoin.match()!.phase).toBe('draft')
    room.host.destroy()
  })

  it('relays live typing only from the drafter on the clock', () => {
    const factory = makeFakeNetwork()
    const room = makeRoom(factory)
    const g1 = joinRoom(factory, 'guest-1', 'Jay')
    room.host.startMatch()

    // Host is on the clock first - their keystrokes reach the guest.
    room.host.typingFrom('host-1', 'host-1', 'wemb')
    expect(g1.typing()).toEqual({ playerId: 'host-1', text: 'wemb' })

    // The guest is NOT on the clock - their typing is dropped, nothing
    // changes on the host side.
    g1.guest.sendTyping('guest-1', 'jordan')
    expect(room.typing()).toEqual({ playerId: 'host-1', text: 'wemb' })

    // Spoofing someone else's playerId is dropped too (sender mismatch).
    g1.guest.sendTyping('host-1', 'hax')
    expect(room.typing()).toEqual({ playerId: 'host-1', text: 'wemb' })
    room.host.destroy()
  })

  it('host can add CPU seats in the lobby', () => {
    const factory = makeFakeNetwork()
    const room = makeRoom(factory)
    room.host.addCpu('BOT ALPHA')
    expect(room.hostLobby().players.some((p) => p.isCpu)).toBe(true)
    room.host.destroy()
  })
})

describe('connectivity: nothing hangs silently', () => {
  it('a guest whose path to the host fails to build hears about it', () => {
    const factory = makeFakeNetwork()
    const room = makeRoom(factory)
    let error: string | null = null
    let stages: string[] = []
    // Build a guest by hand so we can grab its wire and fail it.
    const registry = factory as unknown as PeerFactory
    const guestPeer = registry() as FakePeer
    let wire: FakeWire | null = null
    const originalConnect = guestPeer.connect.bind(guestPeer)
    guestPeer.connect = (peerId: string) => {
      wire = originalConnect(peerId) as FakeWire
      return wire
    }
    new GuestRoom(() => guestPeer, 'TEST', { playerId: 'guest-1', name: 'Jay' }, {
      onSnapshot: () => {},
      onStage: (s) => stages.push(s),
      onWelcome: () => {},
      onRejected: () => {},
      onError: (m) => {
        error = m
      },
    })
    expect(stages).toEqual(['handshake'])
    // ICE failed: PeerJS emits only 'error' on the connection, never 'close'.
    wire!.failNegotiation()
    expect(error).toBe("Couldn't reach the host")
    room.host.destroy()
  })

  it('a guest whose room-server link drops is told, not left connecting', () => {
    const factory = makeFakeNetwork()
    const room = makeRoom(factory)
    const guestPeer = factory() as FakePeer
    let error: string | null = null
    new GuestRoom(() => guestPeer, 'TEST', { playerId: 'guest-1', name: 'Jay' }, {
      onSnapshot: () => {},
      onWelcome: () => {},
      onRejected: () => {},
      onError: (m) => {
        error = m
      },
    })
    guestPeer.dropBroker()
    expect(error).toBe('Lost the connection to the room server')
    room.host.destroy()
  })

  it('a host that loses the broker reports offline, keeps the game, and climbs back on', () => {
    vi.useFakeTimers()
    try {
      const factory = makeFakeNetwork()
      const registry = new Map<string, FakePeer>()
      let hostPeer: FakePeer | null = null
      const capturing: PeerFactory = (peerId?: string) => {
        const peer = factory(peerId) as FakePeer
        if (peerId) hostPeer = peer
        registry.set(peerId ?? '', peer)
        return peer
      }
      const status: boolean[] = []
      const errors: string[] = []
      const host = new HostRoom(
        capturing,
        'TEST',
        { playerId: 'host-1', name: 'Div' },
        CONFIG,
        ctx,
        {
          onSnapshot: () => {},
          onBrokerStatus: (online) => status.push(online),
          onError: (m) => errors.push(m),
        },
      )
      const g1 = joinRoom(factory, 'guest-1', 'Jay')
      expect(g1.welcomed()).toBe(true)
      expect(status).toEqual([true])

      // The broker drops the host; the first two reconnects bounce off the
      // stale registration ("ID is taken"), the third lands.
      hostPeer!.reconnectRejections = 2
      hostPeer!.dropBroker()
      expect(status).toEqual([true, false])
      expect(host.online).toBe(false)

      // Existing guests keep playing peer-to-peer meanwhile.
      host.addCpu('BOT A')
      expect(g1.lobby().players.some((p) => p.isCpu)).toBe(true)

      vi.advanceTimersByTime(1500) // attempt 1: rejected
      vi.advanceTimersByTime(3000) // attempt 2: rejected
      expect(host.online).toBe(false)
      vi.advanceTimersByTime(6000) // attempt 3: back online
      expect(hostPeer!.reconnectCalls).toBe(3)
      expect(host.online).toBe(true)
      expect(status).toEqual([true, false, true])
      // Reconnect noise never became a scary error for the host.
      expect(errors).toEqual([])

      // A late joiner can now find the room again.
      const g2 = joinRoom(factory, 'guest-2', 'Sam')
      expect(g2.welcomed()).toBe(true)
      host.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a foregrounded tab reconnects immediately instead of waiting out the backoff', () => {
    vi.useFakeTimers()
    try {
      const factory = makeFakeNetwork()
      let hostPeer: FakePeer | null = null
      const capturing: PeerFactory = (peerId?: string) => {
        const peer = factory(peerId) as FakePeer
        if (peerId) hostPeer = peer
        return peer
      }
      const host = new HostRoom(capturing, 'TEST', { playerId: 'host-1', name: 'Div' }, CONFIG, ctx, {
        onSnapshot: () => {},
        onError: () => {},
      })
      hostPeer!.dropBroker()
      expect(host.online).toBe(false)
      host.reconnectNow()
      expect(host.online).toBe(true)
      expect(hostPeer!.reconnectCalls).toBe(1)
      vi.advanceTimersByTime(20000) // no stray extra attempts queued
      expect(hostPeer!.reconnectCalls).toBe(1)
      host.destroy()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('mystery auction over the fake wire', () => {
  it('guests never receive the hidden player until the hammer', () => {
    const factory = makeFakeNetwork()
    let hostMatch: MatchState | null = null
    const host = new HostRoom(
      factory,
      'TEST',
      { playerId: 'host-1', name: 'Div' },
      { mode: 'mystery', format: 'series', leagueSize: 2, seed: 3, theme: 'era-00s' },
      ctx,
      {
        onSnapshot: (_l, m) => {
          hostMatch = m
        },
        onError: () => {},
      },
    )
    const g1 = joinRoom(factory, 'guest-1', 'Jay')
    host.startMatch()
    const hostLot = () => (hostMatch!.party as { lot: { cardId: string; clues?: string[]; shown?: number } }).lot
    const guestLot = () => (g1.match()!.party as { lot: { cardId: string; clues?: string[]; shown?: number } }).lot

    // Host knows; guest gets only the revealed clue texts.
    expect(hostLot().cardId.length).toBeGreaterThan(0)
    expect(guestLot().cardId).toBe('')
    expect(guestLot().clues!.length).toBe(guestLot().shown)
    expect(hostLot().clues!.length).toBeGreaterThanOrEqual(guestLot().clues!.length)

    // A guest bid reveals one more clue to everyone, still no name.
    g1.guest.sendAction({ type: 'PARTY', action: { type: 'AUCTION_BID', playerId: 'guest-1', amount: 4 } })
    expect(guestLot().cardId).toBe('')
    expect(guestLot().clues!.length).toBe(Math.min(3, hostLot().clues!.length))

    // Hammer: the guest's own roster now shows exactly who they bought.
    const hidden = hostLot().cardId
    host.dispatchFrom('host-1', { type: 'AUCTION_TICK' })
    host.dispatchFrom('host-1', { type: 'AUCTION_TICK' })
    host.dispatchFrom('host-1', { type: 'AUCTION_TICK' })
    const roster = g1.match()!.party!.teams['guest-1'].roster
    expect(Object.values(roster).some((c) => c?.id === hidden)).toBe(true)
    expect((g1.match()!.party as { lastResult: { cardId: string } }).lastResult.cardId).toBe(hidden)
    host.destroy()
  })
})

describe('auction party over the fake wire', () => {
  it('guests bid, spoofs and guest hammers are rejected, host clock sells', () => {
    const factory = makeFakeNetwork()
    let hostMatch: MatchState | null = null
    const host = new HostRoom(
      factory,
      'TEST',
      { playerId: 'host-1', name: 'Div' },
      { mode: 'auction', format: 'series', leagueSize: 2, seed: 12, theme: 'era-90s' },
      ctx,
      {
        onSnapshot: (_l, m) => {
          hostMatch = m
        },
        onError: () => {},
      },
    )
    const g1 = joinRoom(factory, 'guest-1', 'Jay')
    host.startMatch()
    const match = () => hostMatch!
    expect(match().party!.kind).toBe('auction')
    const lot = () => (match().party as { lot: { price: number; leaderId: string | null; cardId: string } | null }).lot

    // Guest opens the bidding for $7.
    g1.guest.sendAction({ type: 'PARTY', action: { type: 'AUCTION_BID', playerId: 'guest-1', amount: 7 } })
    expect(lot()!.price).toBe(7)
    expect(lot()!.leaderId).toBe('guest-1')

    // Guest can't bid AS the host (sender mismatch) or swing the hammer.
    g1.guest.sendAction({ type: 'PARTY', action: { type: 'AUCTION_BID', playerId: 'host-1', amount: 9 } })
    expect(lot()!.leaderId).toBe('guest-1')
    g1.guest.sendAction({ type: 'AUCTION_TICK' })
    expect(lot()!.price).toBe(7)

    // Host outbids, then the host clock hammers it down in three ticks.
    const soldCard = lot()!.cardId
    host.dispatchFrom('host-1', { type: 'PARTY', action: { type: 'AUCTION_BID', playerId: 'host-1', amount: 8 } })
    host.dispatchFrom('host-1', { type: 'AUCTION_TICK' })
    host.dispatchFrom('host-1', { type: 'AUCTION_TICK' })
    host.dispatchFrom('host-1', { type: 'AUCTION_TICK' })
    const hostRoster = match().party!.teams['host-1'].roster
    expect(Object.values(hostRoster).some((c) => c?.id === soldCard)).toBe(true)
    expect(match().party!.teams['host-1'].budget).toBe(42)
    expect(g1.match()!.party!.teams['host-1'].budget).toBe(42) // guest sees it too
    host.destroy()
  })
})
