import { create } from 'zustand'
import { loadCards } from '../data/loadCards'
import { myPlayerId, saveName, savedName } from '../net/identity'
import { makeRoomCode, type LobbySnapshot } from '../net/protocol'
import { GuestRoom, HostRoom, realPeerFactory } from '../net/room'
import type { Card } from '../types'
import type { DraftCtx } from './draft'
import { applyMatchAction, initMatch, type MatchAction, type MatchConfig, type MatchState } from './match'
import { loadTrophies, saveTrophy, type Trophy } from './trophies'

export type Screen = 'home' | 'setup' | 'join' | 'lobby' | 'game' | 'trophies'
export type SessionMode = 'solo' | 'host' | 'guest'
export type NetStatus = 'idle' | 'connecting' | 'connected' | 'error'

export const DEFAULT_CONFIG: MatchConfig = { mode: 'tiers', format: 'season', leagueSize: 4, seed: 0, input: 'type' }

interface GameStore {
  screen: Screen
  sessionMode: SessionMode | null
  myId: string
  myName: string
  pool: Card[] | null
  config: MatchConfig
  cpuDrafters: number
  match: MatchState | null
  lobby: LobbySnapshot | null
  netStatus: NetStatus
  netError: string | null
  trophies: Trophy[]
  trophySaved: boolean
  autoSimming: boolean

  setName: (name: string) => void
  setConfig: (config: Partial<MatchConfig>) => void
  setCpuDrafters: (n: number) => void
  goHome: () => void
  goSetup: (mode: 'solo' | 'host') => void
  goJoin: () => void
  goTrophies: () => void
  startSolo: () => Promise<void>
  createRoom: () => Promise<void>
  hostAddCpu: () => void
  hostStart: () => void
  joinRoom: (code: string) => Promise<void>
  dispatch: (action: MatchAction) => void
  simAllRemaining: () => void
}

let hostRoom: HostRoom | null = null
let guestRoom: GuestRoom | null = null
let autoSimTimer: number | null = null

async function ensurePool(get: () => GameStore, set: (partial: Partial<GameStore>) => void): Promise<Card[]> {
  const existing = get().pool
  if (existing) return existing
  const pool = await loadCards()
  set({ pool })
  return pool
}

function stopAutoSim(set: (partial: Partial<GameStore>) => void) {
  if (autoSimTimer !== null) {
    window.clearInterval(autoSimTimer)
    autoSimTimer = null
  }
  set({ autoSimming: false })
}

function teardownNet() {
  hostRoom?.destroy()
  guestRoom?.destroy()
  hostRoom = null
  guestRoom = null
}

export const useGame = create<GameStore>((set, get) => {
  // Capture a finished championship into the trophy case exactly once.
  const maybeRecordTrophy = (match: MatchState | null) => {
    if (!match || match.phase !== 'done' || match.championId === null || get().trophySaved) return
    const champion = match.entries.find((e) => e.id === match.championId)
    const trophies = saveTrophy({
      id: crypto.randomUUID(),
      wonAt: new Date().toISOString(),
      championName: champion?.name ?? match.championId,
      championWasMe: match.championId === get().myId,
      finalsMvpName: match.finalsMvp?.name ?? null,
      seasonMvpName: match.seasonMvp?.name ?? null,
      format: match.config.format,
      leagueSize: match.config.leagueSize,
    })
    set({ trophies, trophySaved: true })
  }

  const applySnapshot = (lobby: LobbySnapshot, match: MatchState | null) => {
    set({ lobby, match, netStatus: 'connected', screen: match ? 'game' : 'lobby' })
    maybeRecordTrophy(match)
  }

  return {
    screen: 'home',
    sessionMode: null,
    myId: myPlayerId(),
    myName: savedName(),
    pool: null,
    config: { ...DEFAULT_CONFIG },
    cpuDrafters: 1,
    match: null,
    lobby: null,
    netStatus: 'idle',
    netError: null,
    trophies: loadTrophies(),
    trophySaved: false,
    autoSimming: false,

    setName: (name) => {
      saveName(name)
      set({ myName: name })
    },

    setConfig: (partial) => set({ config: { ...get().config, ...partial } }),
    setCpuDrafters: (n) => set({ cpuDrafters: n }),

    goHome: () => {
      stopAutoSim(set)
      teardownNet()
      set({ screen: 'home', sessionMode: null, match: null, lobby: null, netStatus: 'idle', netError: null, trophySaved: false })
    },
    goSetup: (mode) => set({ screen: 'setup', sessionMode: mode, netError: null }),
    goJoin: () => set({ screen: 'join', sessionMode: 'guest', netError: null }),
    goTrophies: () => set({ screen: 'trophies' }),

    startSolo: async () => {
      const pool = await ensurePool(get, set)
      const ctx: DraftCtx = { pool }
      const { config, cpuDrafters, myId, myName } = get()
      const seeded: MatchConfig = { ...config, seed: Math.floor(Math.random() * 2 ** 31) }
      const players = [
        { id: myId, name: myName || 'YOU', isCpu: false },
        ...Array.from({ length: cpuDrafters }, (_, i) => ({ id: `cpu-${i}`, name: `BOT ${String.fromCharCode(65 + i)}`, isCpu: true })),
      ]
      const match = initMatch(seeded, players, ctx)
      set({ match, screen: 'game', trophySaved: false })
    },

    createRoom: async () => {
      set({ netStatus: 'connecting', netError: null })
      try {
        const pool = await ensurePool(get, set)
        const factory = await realPeerFactory()
        const { config, myId, myName } = get()
        const seeded: MatchConfig = { ...config, seed: Math.floor(Math.random() * 2 ** 31) }
        const code = makeRoomCode()
        hostRoom = new HostRoom(factory, code, { playerId: myId, name: myName || 'HOST' }, seeded, { pool }, {
          onSnapshot: applySnapshot,
          onError: (message) => set({ netStatus: 'error', netError: message }),
        })
        set({ screen: 'lobby' })
      } catch (err) {
        set({ netStatus: 'error', netError: err instanceof Error ? err.message : 'Failed to create room' })
      }
    },

    hostAddCpu: () => {
      const bots = get().lobby?.players.filter((p) => p.isCpu).length ?? 0
      hostRoom?.addCpu(`BOT ${String.fromCharCode(65 + bots)}`)
    },

    hostStart: () => {
      hostRoom?.updateConfig({ ...get().config, seed: get().lobby?.config.seed ?? Math.floor(Math.random() * 2 ** 31) })
      hostRoom?.startMatch()
      set({ trophySaved: false })
    },

    joinRoom: async (code) => {
      set({ netStatus: 'connecting', netError: null })
      try {
        const factory = await realPeerFactory()
        const { myId, myName } = get()
        guestRoom = new GuestRoom(factory, code, { playerId: myId, name: myName || 'GUEST' }, {
          onSnapshot: applySnapshot,
          onWelcome: () => set({ netStatus: 'connected' }),
          onRejected: (reason) => set({ netStatus: 'error', netError: reason }),
          onError: (message) => set({ netStatus: 'error', netError: message }),
        })
      } catch (err) {
        set({ netStatus: 'error', netError: err instanceof Error ? err.message : 'Failed to join room' })
      }
    },

    dispatch: (action) => {
      const { sessionMode, match, pool, myId } = get()
      if (sessionMode === 'guest') {
        guestRoom?.sendAction(action)
        return
      }
      if (sessionMode === 'host') {
        hostRoom?.dispatchFrom(myId, action)
        return
      }
      if (!match || !pool) return
      const next = applyMatchAction(match, action, { pool })
      if (next !== match) {
        set({ match: next })
        maybeRecordTrophy(next)
      }
    },

    simAllRemaining: () => {
      const tick = () => {
        const { match } = get()
        if (!match || (match.phase !== 'season' && match.phase !== 'playoffs')) {
          stopAutoSim(set)
          return
        }
        get().dispatch({ type: 'SIM_NEXT' })
      }
      if (autoSimTimer !== null) {
        stopAutoSim(set)
        return
      }
      set({ autoSimming: true })
      autoSimTimer = window.setInterval(tick, 650)
    },
  }
})
