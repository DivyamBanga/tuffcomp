import { afterEach, describe, expect, it } from 'vitest'
import { fetchIceServers, hasRelay, resetIceCache, STUN_ONLY } from './ice'

const relayBody = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
  ],
  ttl: 43200,
}

const fakeFetch = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

afterEach(() => resetIceCache())

describe('ICE servers', () => {
  it('the STUN-only fallback carries no relay, and says so', () => {
    expect(hasRelay(STUN_ONLY)).toBe(false)
    expect(hasRelay(relayBody.iceServers)).toBe(true)
  })

  // VITE_JUDGE_PROXY_URL is unset under test, so the Worker is "not
  // deployed": every call must land on STUN-only without touching fetch.
  it('without a Worker, rooms get STUN-only and never call out', async () => {
    let called = 0
    const spy: typeof fetch = (async () => {
      called++
      return new Response('{}')
    }) as unknown as typeof fetch
    expect(await fetchIceServers(spy)).toEqual(STUN_ONLY)
    expect(called).toBe(0)
  })

  it('rejects malformed relay payloads rather than breaking rooms', async () => {
    // Even if a proxy were configured, garbage must degrade to STUN-only.
    expect(await fetchIceServers(fakeFetch(200, { iceServers: 'nope' }))).toEqual(STUN_ONLY)
    expect(await fetchIceServers(fakeFetch(502, { error: 'turn upstream error' }))).toEqual(STUN_ONLY)
  })
})
