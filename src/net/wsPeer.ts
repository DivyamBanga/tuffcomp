import type { PeerFactory, WireConnection, WirePeer } from './room'

// Room transport over the Worker's WebSocket relay (worker/judge-proxy.js,
// class RoomRelay). Plain wss:// on 443 reaches through any NAT, firewall
// or carrier - no ICE, no TURN, no third party. Same WirePeer /
// WireConnection contract as the PeerJS transport, so the room logic
// neither knows nor cares which one carries it.
//
// Frames: host <-> relay {t:'join',id} {t:'leave',id} {t:'msg',id,data}
//         {t:'close',id}; guest <-> relay {t:'msg',data}.

type WebSocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState'> & {
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev: { code: number }) => void) | null
  onerror: ((ev: unknown) => void) | null
}
export type WebSocketCtor = new (url: string) => WebSocketLike

const codeOf = (peerId: string) => peerId.split('-').pop() ?? ''

const CLOSE_MESSAGES: Record<number, string> = {
  4004: "That room isn't open. Check the code with the host.",
  4002: 'The host dropped out of the room.',
  4001: 'The host closed your seat.',
}

export function relayPeerFactory(baseUrl: string, WS: WebSocketCtor = WebSocket as unknown as WebSocketCtor): PeerFactory {
  const wsBase = baseUrl.replace(/^http/, 'ws').replace(/\/$/, '')
  return (peerId?: string) => (peerId ? hostPeer(wsBase, codeOf(peerId), peerId, WS) : guestPeer(wsBase, WS))
}

interface WireHandlers {
  data: ((data: unknown) => void)[]
  close: (() => void)[]
  error: ((err: Error) => void)[]
}

function parse(raw: unknown): { t?: string; id?: string; data?: unknown } | null {
  try {
    const msg = JSON.parse(typeof raw === 'string' ? raw : '')
    return msg && typeof msg === 'object' ? msg : null
  } catch {
    return null
  }
}

// The host: one socket to the room, one wire per guest id, all multiplexed.
// reconnect() reopens the socket; the wires survive it because they only
// ever read the CURRENT socket, and the relay re-announces attached guests.
function hostPeer(wsBase: string, code: string, peerId: string, WS: WebSocketCtor): WirePeer {
  const openHandlers: ((id: string) => void)[] = []
  const errorHandlers: ((err: Error) => void)[] = []
  const disconnectHandlers: (() => void)[] = []
  const connHandlers: ((conn: WireConnection) => void)[] = []
  const wires = new Map<string, WireHandlers>()
  let ws: WebSocketLike | null = null
  let destroyed = false

  const wireFor = (id: string): WireConnection => ({
    send: (data) => {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'msg', id, data }))
    },
    onData: (h) => wires.get(id)?.data.push(h),
    onClose: (h) => wires.get(id)?.close.push(h),
    onError: (h) => wires.get(id)?.error.push(h),
    close: () => {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'close', id }))
      const w = wires.get(id)
      wires.delete(id)
      for (const h of w?.close ?? []) h()
    },
  })

  const open = () => {
    const socket = new WS(`${wsBase}/room/${code}/host`)
    ws = socket
    socket.onopen = () => {
      console.info('[net] relay host OPEN', code)
      for (const h of openHandlers) h(peerId)
    }
    socket.onmessage = (e) => {
      const msg = parse(e.data)
      if (!msg || typeof msg.id !== 'string') return
      if (msg.t === 'join') {
        if (wires.has(msg.id)) return // a known guest, re-announced after our reconnect
        wires.set(msg.id, { data: [], close: [], error: [] })
        for (const h of connHandlers) h(wireFor(msg.id))
      } else if (msg.t === 'msg') {
        for (const h of wires.get(msg.id)?.data ?? []) h(msg.data)
      } else if (msg.t === 'leave') {
        const w = wires.get(msg.id)
        wires.delete(msg.id)
        for (const h of w?.close ?? []) h()
      }
    }
    socket.onclose = (e) => {
      if (destroyed || ws !== socket) return
      console.info('[net] relay host CLOSED', e.code)
      if (e.code === 4000) {
        for (const h of errorHandlers) h(new Error('This room was opened somewhere else'))
        return
      }
      for (const h of disconnectHandlers) h()
    }
    socket.onerror = () => {} // the close that follows carries the story
  }
  open()

  return {
    onOpen: (h) => openHandlers.push(h),
    onError: (h) => errorHandlers.push(h),
    onDisconnected: (h) => disconnectHandlers.push(h),
    onConnection: (h) => connHandlers.push(h),
    reconnect: () => {
      if (!destroyed) open()
    },
    connect: () => {
      throw new Error('a host peer does not connect out')
    },
    destroy: () => {
      destroyed = true
      ws?.close()
    },
  }
}

// A guest: no registration step, so the peer is "open" at once; connect()
// dials the room and the single wire speaks to the host through it.
function guestPeer(wsBase: string, WS: WebSocketCtor): WirePeer {
  const id = crypto.randomUUID()
  const openHandlers: ((id: string) => void)[] = []
  let ws: WebSocketLike | null = null
  let destroyed = false

  return {
    onOpen: (h) => {
      openHandlers.push(h)
      queueMicrotask(() => {
        if (!destroyed) h(id)
      })
    },
    onError: () => {},
    onDisconnected: () => {},
    onConnection: () => {},
    reconnect: () => {},
    connect: (target) => {
      const code = codeOf(target)
      const handlers: WireHandlers = { data: [], close: [], error: [] }
      const queue: unknown[] = []
      let opened = false
      let failed = false
      const fail = (message: string) => {
        if (failed) return
        failed = true
        for (const h of handlers.error) h(new Error(message))
      }
      const socket = new WS(`${wsBase}/room/${code}/guest/${id}`)
      ws = socket
      socket.onopen = () => {
        opened = true
        console.info('[net] relay guest OPEN', code)
        for (const data of queue) socket.send(JSON.stringify({ t: 'msg', data }))
        queue.length = 0
      }
      socket.onmessage = (e) => {
        const msg = parse(e.data)
        if (msg?.t === 'msg') for (const h of handlers.data) h(msg.data)
        else if (msg?.t === 'noroom') fail(CLOSE_MESSAGES[4004])
      }
      socket.onclose = (e) => {
        if (destroyed || failed) return
        console.info('[net] relay guest CLOSED', e.code)
        const reason = CLOSE_MESSAGES[e.code]
        if (!opened || reason) fail(reason ?? "Couldn't reach the room server")
        else for (const h of handlers.close) h()
      }
      socket.onerror = () => {}
      return {
        send: (data) => {
          if (opened && socket.readyState === 1) socket.send(JSON.stringify({ t: 'msg', data }))
          else queue.push(data)
        },
        onData: (h) => handlers.data.push(h),
        onClose: (h) => handlers.close.push(h),
        onError: (h) => handlers.error.push(h),
        close: () => socket.close(),
      }
    },
    destroy: () => {
      destroyed = true
      ws?.close()
    },
  }
}
