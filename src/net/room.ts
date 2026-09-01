import { currentPlayerId, type DraftCtx, type DraftPlayer } from '../game/draft'
import { applyMatchAction, initMatch, type MatchAction, type MatchConfig, type MatchState } from '../game/match'
import { peerIdForCode, type LobbySnapshot, type NetMessage } from './protocol'

// Minimal surface of a PeerJS DataConnection / Peer, so the whole room can
// be unit tested with in-memory fakes and PeerJS stays behind one factory.
export interface WireConnection {
  send(data: unknown): void
  onData(handler: (data: unknown) => void): void
  onClose(handler: () => void): void
  close(): void
}

export interface WirePeer {
  onOpen(handler: (id: string) => void): void
  onConnection(handler: (conn: WireConnection) => void): void
  onError(handler: (err: Error) => void): void
  connect(peerId: string): WireConnection
  destroy(): void
}

export type PeerFactory = (peerId?: string) => WirePeer

export interface RoomEvents {
  onSnapshot: (lobby: LobbySnapshot, match: MatchState | null) => void
  onError: (message: string) => void
  // Live keystrokes from the drafter on the clock (ephemeral, not state).
  onTyping?: (playerId: string, text: string) => void
}

const MAX_PLAYERS = 8

// ------------------------------------------------------------------- host

export class HostRoom {
  readonly code: string
  private peer: WirePeer
  private conns = new Map<string, WireConnection>() // playerId -> conn
  private lobby: LobbySnapshot
  private match: MatchState | null = null
  private ctx: DraftCtx
  private events: RoomEvents

  constructor(
    peerFactory: PeerFactory,
    code: string,
    host: { playerId: string; name: string },
    config: MatchConfig,
    ctx: DraftCtx,
    events: RoomEvents,
  ) {
    this.code = code
    this.ctx = ctx
    this.events = events
    this.lobby = {
      code,
      hostName: host.name,
      config,
      players: [{ id: host.playerId, name: host.name, isCpu: false }],
    }
    this.peer = peerFactory(peerIdForCode(code))
    this.peer.onError((err) => events.onError(err.message))
    this.peer.onConnection((conn) => this.accept(conn))
    this.peer.onOpen(() => this.publish())
  }

  private accept(conn: WireConnection) {
    let seatId: string | null = null
    conn.onData((raw) => {
      const msg = raw as NetMessage
      if (msg.t === 'HELLO') {
        const existing = this.lobby.players.find((p) => p.id === msg.playerId)
        if (!existing && this.match !== null) {
          conn.send({ t: 'REJECTED', reason: 'Game already started' } satisfies NetMessage)
          return
        }
        if (!existing && this.lobby.players.length >= MAX_PLAYERS) {
          conn.send({ t: 'REJECTED', reason: 'Room is full' } satisfies NetMessage)
          return
        }
        seatId = msg.playerId
        this.conns.get(msg.playerId)?.close()
        this.conns.set(msg.playerId, conn)
        if (!existing) {
          this.lobby = { ...this.lobby, players: [...this.lobby.players, { id: msg.playerId, name: msg.name, isCpu: false }] }
        }
        conn.send({ t: 'WELCOME', playerId: msg.playerId } satisfies NetMessage)
        this.publish()
        return
      }
      if (msg.t === 'ACTION' && seatId !== null) {
        this.dispatchFrom(seatId, msg.action)
      }
      if (msg.t === 'TYPING' && seatId !== null) {
        this.typingFrom(seatId, msg.playerId, msg.text)
      }
    })
    conn.onClose(() => {
      // Keep the seat (rejoinable by the same playerId); just drop the pipe.
      if (seatId && this.conns.get(seatId) === conn) this.conns.delete(seatId)
    })
  }

  // Central authority: every action (including the host's own) passes the
  // same validation, so a modified client can't act out of turn or move
  // someone else's players.
  private allowed(senderId: string, action: MatchAction): boolean {
    const isHost = senderId === this.lobby.players[0]?.id
    switch (action.type) {
      case 'DRAFT':
        return action.action.playerId === senderId
      case 'PARTY':
        return action.action.playerId === senderId
      case 'MOVE_AFTER_DRAFT':
        return action.playerId === senderId
      case 'AUCTION_TICK': // only the host's clock swings the hammer
      case 'SET_JUDGE':
      case 'BEGIN_COMPETITION':
      case 'SIM_NEXT':
        return isHost
      default:
        return false
    }
  }

  dispatchFrom(senderId: string, action: MatchAction) {
    if (this.match === null || !this.allowed(senderId, action)) return
    const next = applyMatchAction(this.match, action, this.ctx)
    if (next !== this.match) {
      this.match = next
      this.publish()
    }
  }

  // Relay live typing to the whole room - only from the drafter actually
  // on the clock, so spoofed or stale keystrokes go nowhere.
  typingFrom(senderId: string, playerId: string, text: string) {
    if (senderId !== playerId) return
    const draft = this.match?.draft
    if (!draft || this.match?.phase !== 'draft' || currentPlayerId(draft) !== playerId) return
    const msg: NetMessage = { t: 'TYPING', playerId, text: text.slice(0, 32) }
    for (const [id, conn] of this.conns) {
      if (id !== playerId) conn.send(msg)
    }
    this.events.onTyping?.(playerId, text.slice(0, 32))
  }

  addCpu(name: string) {
    if (this.match !== null || this.lobby.players.length >= MAX_PLAYERS) return
    const id = `cpu-${this.lobby.players.length}-${Math.floor(Math.random() * 1e6)}`
    this.lobby = { ...this.lobby, players: [...this.lobby.players, { id, name, isCpu: true }] }
    this.publish()
  }

  updateConfig(config: MatchConfig) {
    if (this.match !== null) return
    this.lobby = { ...this.lobby, config }
    this.publish()
  }

  startMatch() {
    if (this.match !== null || this.lobby.players.length === 0) return
    const players: DraftPlayer[] = this.lobby.players
    this.match = initMatch(this.lobby.config, players, this.ctx)
    this.publish()
  }

  private publish() {
    const msg: NetMessage = { t: 'SNAPSHOT', lobby: this.lobby, match: this.match }
    for (const conn of this.conns.values()) conn.send(msg)
    this.events.onSnapshot(this.lobby, this.match)
  }

  destroy() {
    this.peer.destroy()
  }
}

// ------------------------------------------------------------------ guest

export class GuestRoom {
  private peer: WirePeer
  private conn: WireConnection | null = null
  private events: RoomEvents & { onWelcome: () => void; onRejected: (reason: string) => void }

  constructor(
    peerFactory: PeerFactory,
    code: string,
    me: { playerId: string; name: string },
    events: RoomEvents & { onWelcome: () => void; onRejected: (reason: string) => void },
  ) {
    this.events = events
    this.peer = peerFactory()
    this.peer.onError((err) => events.onError(err.message))
    this.peer.onOpen(() => {
      const conn = this.peer.connect(peerIdForCode(code))
      this.conn = conn
      conn.onData((raw) => {
        const msg = raw as NetMessage
        if (msg.t === 'WELCOME') this.events.onWelcome()
        else if (msg.t === 'REJECTED') this.events.onRejected(msg.reason)
        else if (msg.t === 'SNAPSHOT') this.events.onSnapshot(msg.lobby, msg.match)
        else if (msg.t === 'TYPING') this.events.onTyping?.(msg.playerId, msg.text)
      })
      conn.onClose(() => events.onError('Connection to host closed'))
      conn.send({ t: 'HELLO', playerId: me.playerId, name: me.name } satisfies NetMessage)
    })
  }

  sendAction(action: MatchAction) {
    this.conn?.send({ t: 'ACTION', action } satisfies NetMessage)
  }

  sendTyping(playerId: string, text: string) {
    this.conn?.send({ t: 'TYPING', playerId, text } satisfies NetMessage)
  }

  destroy() {
    this.peer.destroy()
  }
}

// -------------------------------------------------------- real transport

// Wraps PeerJS (loaded lazily so unit tests never touch the network).
export async function realPeerFactory(): Promise<PeerFactory> {
  const { default: Peer } = await import('peerjs')
  return (peerId?: string) => {
    const peer = peerId ? new Peer(peerId) : new Peer()
    return {
      onOpen: (handler) => peer.on('open', handler),
      onError: (handler) => peer.on('error', (err) => handler(err as Error)),
      onConnection: (handler) =>
        peer.on('connection', (dataConn) => {
          const wire: WireConnection = {
            send: (data) => dataConn.send(data),
            onData: (h) => dataConn.on('data', h),
            onClose: (h) => dataConn.on('close', h),
            close: () => dataConn.close(),
          }
          // PeerJS queues sends until open; normalize by exposing after open.
          if (dataConn.open) handler(wire)
          else dataConn.on('open', () => handler(wire))
        }),
      connect: (target) => {
        const dataConn = peer.connect(target, { reliable: true })
        return {
          send: (data) => {
            if (dataConn.open) dataConn.send(data)
            else dataConn.on('open', () => dataConn.send(data))
          },
          onData: (h) => dataConn.on('data', h),
          onClose: (h) => dataConn.on('close', h),
          close: () => dataConn.close(),
        }
      },
      destroy: () => peer.destroy(),
    }
  }
}
