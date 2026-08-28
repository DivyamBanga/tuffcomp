import { beforeAll, describe, expect, it } from 'vitest'
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
  close() {
    for (const h of this.closeHandlers) h()
    for (const h of this.other?.closeHandlers ?? []) h()
  }
}

class FakePeer implements WirePeer {
  private openHandlers: ((id: string) => void)[] = []
  private connHandlers: ((conn: WireConnection) => void)[] = []
  private registry: Map<string, FakePeer>
  private id: string
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
  onError() {}
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
