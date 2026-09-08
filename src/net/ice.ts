// ICE servers for the peer-to-peer rooms.
//
// PeerJS ships STUN plus two TURN relays (eu-0/us-0.turn.peerjs.com) that
// no longer exist - the project discontinued free TURN in December 2023
// and the hostnames don't even resolve. Without a relay, any two players
// whose networks can't punch through directly (carrier NAT, symmetric NAT,
// UDP-blocked WiFi) simply cannot connect.
//
// The fix: the judge Worker (worker/judge-proxy.js) mints short-lived
// Cloudflare TURN credentials at /turn when it's configured. We ask it at
// room time and fall back to STUN-only when it isn't there yet.

const PROXY_URL = ((import.meta.env?.VITE_JUDGE_PROXY_URL as string | undefined) ?? '').trim()

export const STUN_ONLY: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
]

interface Cached {
  servers: RTCIceServer[]
  expiresAt: number
}
let cached: Cached | null = null

function validServers(value: unknown): RTCIceServer[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const ok = value.every(
    (s) => s && typeof s === 'object' && (typeof s.urls === 'string' || (Array.isArray(s.urls) && s.urls.length > 0)),
  )
  return ok ? (value as RTCIceServer[]) : null
}

// Whether a relay is part of this config (for the UI and for tests).
export function hasRelay(servers: RTCIceServer[]): boolean {
  return servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith('turn')))
}

export async function fetchIceServers(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<RTCIceServer[]> {
  if (cached && cached.expiresAt > now) return cached.servers
  if (!PROXY_URL) return STUN_ONLY
  try {
    const response = await fetchImpl(`${PROXY_URL.replace(/\/$/, '')}/turn`, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) return STUN_ONLY
    const data = (await response.json()) as { iceServers?: unknown; ttl?: unknown }
    const servers = validServers(data.iceServers)
    if (!servers) return STUN_ONLY
    // Reuse credentials for most of their life; never past it.
    const ttl = typeof data.ttl === 'number' && data.ttl > 0 ? data.ttl : 3600
    cached = { servers, expiresAt: now + ttl * 1000 * 0.8 }
    return servers
  } catch {
    return STUN_ONLY
  }
}

export function resetIceCache() {
  cached = null
}
