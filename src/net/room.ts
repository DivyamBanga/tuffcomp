import { currentPlayerId, type DraftCtx, type DraftPlayer } from '../game/draft'
import { applyMatchAction, initMatch, type MatchAction, type MatchConfig, type MatchState } from '../game/match'
import { hasRelay } from './ice'
import { peerIdForCode, type LobbySnapshot, type NetMessage } from './protocol'

// Minimal surface of a PeerJS DataConnection / Peer, so the whole room can
// be unit tested with in-memory fakes and PeerJS stays behind one factory.
export interface WireConnection {
  send(data: unknown): void
  onData(handler: (data: unknown) => void): void
  onClose(handler: () => void): void
  // A connection that never opened reports its failure ONLY here (PeerJS
  // emits no 'close' for it) - the reason joins used to hang forever.
  onError(handler: (err: Error) => void): void
  close(): void
}

export interface WirePeer {
  onOpen(handler: (id: string) => void): void
  onConnection(handler: (conn: WireConnection) => void): void
  onError(handler: (err: Error) => void): void
  // The signaling broker dropped us; PeerJS never reconnects on its own.
  onDisconnected(handler: () => void): void
  reconnect(): void
  connect(peerId: string): WireConnection
  destroy(): void
}

export type PeerFactory = (peerId?: string) => WirePeer

export interface RoomEvents {
  onSnapshot: (lobby: LobbySnapshot, match: MatchState | null) => void
  onError: (message: string) => void
  // Live keystrokes from the drafter on the clock (ephemeral, not state).
  onTyping?: (playerId: string, text: string) => void
  // Host only: are we reachable through the broker right now?
  onBrokerStatus?: (online: boolean) => void
}

// Host reconnect backoff: quick first retry, then ease off. The broker
// may still hold our old registration for up to a minute, so early
// attempts can bounce with "ID is taken" - that's fine, we keep going.
const RECONNECT_DELAYS = [1500, 3000, 6000, 10000, 15000]

const MAX_PLAYERS = 8

// A MYSTERY AUCTION's open lot hides the player: guests get the clues
// revealed so far and nothing that names him. The host keeps the truth.
function redactForGuests(match: MatchState | null): MatchState | null {
  const party = match?.party
  if (!match || !party || party.kind !== 'auction' || !party.mystery || !party.lot) return match
  const lot = party.lot
  return {
    ...match,
    party: { ...party, lot: { ...lot, cardId: '', clues: (lot.clues ?? []).slice(0, lot.shown ?? 0) } },
  }
}

// ------------------------------------------------------------------- host

export class HostRoom {
  readonly code: string
  private peer: WirePeer
  private conns = new Map<string, WireConnection>() // playerId -> conn
  private lobby: LobbySnapshot
  private match: MatchState | null = null
  private ctx: DraftCtx
  private events: RoomEvents
  private brokerOnline = false
  private destroyed = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0

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
    this.peer.onError((err) => {
      // While reconnecting, "ID is taken" and friends are expected noise -
      // the banner already says we're offline. Everything else surfaces.
      if (!this.brokerOnline && this.reconnectAttempt > 0) return
      events.onError(err.message)
    })
    this.peer.onConnection((conn) => this.accept(conn))
    this.peer.onOpen(() => {
      this.brokerOnline = true
      this.reconnectAttempt = 0
      events.onBrokerStatus?.(true)
      this.publish()
    })
    this.peer.onDisconnected(() => {
      if (this.destroyed) return
      if (this.brokerOnline) events.onBrokerStatus?.(false)
      this.brokerOnline = false
      this.scheduleReconnect()
    })
  }

  // Existing data channels keep flowing without the broker; only NEW
  // joiners need it. So we keep the same room code and quietly climb back
  // on, backing off between attempts.
  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer !== null) return
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectAttempt++
      this.tryReconnect()
    }, delay)
  }

  private tryReconnect() {
    if (this.destroyed || this.brokerOnline) return
    try {
      this.peer.reconnect()
    } catch {
      this.scheduleReconnect()
    }
  }

  // The tab came back to the foreground: don't wait out the backoff.
  reconnectNow() {
    if (this.destroyed || this.brokerOnline) return
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectAttempt++
    this.tryReconnect()
  }

  get online(): boolean {
    return this.brokerOnline
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
    const msg: NetMessage = { t: 'SNAPSHOT', lobby: this.lobby, match: redactForGuests(this.match) }
    for (const conn of this.conns.values()) conn.send(msg)
    this.events.onSnapshot(this.lobby, this.match)
  }

  destroy() {
    this.destroyed = true
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.peer.destroy()
  }
}

// ------------------------------------------------------------------ guest

export type JoinStage = 'finding' | 'handshake'

export interface GuestEvents extends RoomEvents {
  onWelcome: () => void
  onRejected: (reason: string) => void
  // 'finding': reaching the room server; 'handshake': building the path
  // to the host and saying hello.
  onStage?: (stage: JoinStage) => void
}

export class GuestRoom {
  private peer: WirePeer
  private conn: WireConnection | null = null
  private events: GuestEvents

  constructor(peerFactory: PeerFactory, code: string, me: { playerId: string; name: string }, events: GuestEvents) {
    this.events = events
    this.peer = peerFactory()
    this.peer.onError((err) => events.onError(err.message))
    this.peer.onDisconnected(() => events.onError('Lost the connection to the room server'))
    this.peer.onOpen(() => {
      events.onStage?.('handshake')
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
      // The path to the host could not be built. PeerJS reports an ICE
      // failure only here; the relay says why (no such room, host gone).
      conn.onError((err) => events.onError(err.message || "Couldn't reach the host"))
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

// ICE servers come from net/ice.ts: STUN alone fails for peers behind
// symmetric NATs and restrictive firewalls (corporate/university networks,
// some mobile carriers), so a TURN relay is needed for those to land. The
// relay credentials are minted by the Worker; the public Open Relay
// credentials that used to sit here are dead (the server rejects them).

// --- diagnostics -----------------------------------------------------------
// Verbose WebRTC/PeerJS logging to pinpoint WHY a peer can't join: does the
// peer open, does the data channel connect, and crucially - does ICE ever
// gather a `relay` candidate (proof TURN is working) or does it stall in
// `checking`/`failed` (the signature of a NAT/firewall that needs TURN)?
// Toggle off by setting localStorage 'ringchasers:netlog' to '0'.
function netlogEnabled(): boolean {
  try {
    return localStorage.getItem('ringchasers:netlog') !== '0'
  } catch {
    return true
  }
}

function netlog(...args: unknown[]) {
  if (netlogEnabled()) console.info('[net]', ...args)
}

// Attach listeners to the underlying RTCPeerConnection. It's created during
// negotiation, so it may not exist the instant a connection object appears -
// retry briefly until PeerJS wires it up.
function watchPeerConnection(dataConn: import('peerjs').DataConnection, tag: string, tries = 0) {
  const pc = dataConn.peerConnection
  if (!pc) {
    if (tries < 40) setTimeout(() => watchPeerConnection(dataConn, tag, tries + 1), 50)
    return
  }
  netlog(`${tag} pc ready · ice=${pc.iceConnectionState} conn=${pc.connectionState}`)
  pc.addEventListener('iceconnectionstatechange', () =>
    netlog(`${tag} iceConnectionState → ${pc.iceConnectionState}`),
  )
  pc.addEventListener('connectionstatechange', () =>
    netlog(`${tag} connectionState → ${pc.connectionState}`),
  )
  pc.addEventListener('icegatheringstatechange', () =>
    netlog(`${tag} iceGatheringState → ${pc.iceGatheringState}`),
  )
  pc.addEventListener('icecandidateerror', (e) => {
    const err = e as RTCPeerConnectionIceErrorEvent
    netlog(`${tag} ICE candidate error · url=${err.url} code=${err.errorCode} ${err.errorText}`)
  })
  pc.addEventListener('icecandidate', (e) => {
    if (!e.candidate) {
      netlog(`${tag} ICE gathering complete`)
      return
    }
    // "typ host" = local, "srflx" = STUN-reflexive, "relay" = TURN. Seeing a
    // relay candidate is proof TURN authenticated; never seeing one on a
    // failing peer means TURN isn't working for them.
    const m = /typ (\w+)/.exec(e.candidate.candidate)
    netlog(`${tag} ICE candidate · ${m ? m[1] : '?'} · ${e.candidate.candidate}`)
  })
}

function watchDataConn(dataConn: import('peerjs').DataConnection, tag: string) {
  netlog(`${tag} data connection created → ${dataConn.peer}`)
  watchPeerConnection(dataConn, tag)
  dataConn.on('open', () => netlog(`${tag} data channel OPEN`))
  dataConn.on('close', () => netlog(`${tag} data channel CLOSE`))
  dataConn.on('error', (err) => netlog(`${tag} data channel ERROR · ${(err as Error).message}`))
}

// Wraps PeerJS (loaded lazily so unit tests never touch the network).
// `iceServers` replaces PeerJS's defaults, whose built-in TURN relays no
// longer exist (see net/ice.ts).
export async function realPeerFactory(iceServers: RTCIceServer[]): Promise<PeerFactory> {
  const { default: Peer } = await import('peerjs')
  const options = { config: { iceServers } }
  return (peerId?: string) => {
    netlog(`creating peer · requestedId=${peerId ?? '(anonymous)'} · ice=${hasRelay(iceServers) ? 'stun+relay' : 'stun-only (no relay: Worker /turn not configured)'}`)
    const peer = peerId ? new Peer(peerId, options) : new Peer(options)
    peer.on('open', (id) => netlog(`peer OPEN · id=${id}`))
    // PeerJS errors carry a `.type` (peer-unavailable, unavailable-id,
    // network, webrtc, browser-incompatible...) that says far more than the
    // message alone about why a join stalls.
    peer.on('error', (err) => netlog(`peer ERROR · type=${(err as { type?: string }).type} · ${err.message}`))
    peer.on('disconnected', () => netlog('peer DISCONNECTED from broker'))
    peer.on('close', () => netlog('peer CLOSED'))
    return {
      onOpen: (handler) => peer.on('open', handler),
      onError: (handler) => peer.on('error', (err) => handler(err as Error)),
      onDisconnected: (handler) => peer.on('disconnected', () => handler()),
      reconnect: () => peer.reconnect(),
      onConnection: (handler) =>
        peer.on('connection', (dataConn) => {
          watchDataConn(dataConn, 'host<-guest')
          const wire: WireConnection = {
            send: (data) => dataConn.send(data),
            onData: (h) => dataConn.on('data', h),
            onClose: (h) => dataConn.on('close', h),
            onError: (h) => dataConn.on('error', (err) => h(err as Error)),
            close: () => dataConn.close(),
          }
          // PeerJS queues sends until open; normalize by exposing after open.
          if (dataConn.open) handler(wire)
          else dataConn.on('open', () => handler(wire))
        }),
      connect: (target) => {
        netlog(`connecting to host peer → ${target}`)
        const dataConn = peer.connect(target, { reliable: true })
        watchDataConn(dataConn, 'guest->host')
        return {
          send: (data) => {
            if (dataConn.open) dataConn.send(data)
            else dataConn.on('open', () => dataConn.send(data))
          },
          onData: (h) => dataConn.on('data', h),
          onClose: (h) => dataConn.on('close', h),
          onError: (h) => dataConn.on('error', () => h(new Error("Couldn't reach the host"))),
          close: () => dataConn.close(),
        }
      },
      destroy: () => {
        netlog('destroying peer')
        peer.destroy()
      },
    }
  }
}
