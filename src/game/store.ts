import { create } from 'zustand'
import { loadCards } from '../data/loadCards'
import { clearJudgeKey, judgeAvailable, judgeLeague, saveJudgeKey, type JudgeContext } from '../llm/judge'
import { themeById } from './themes'
import { myPlayerId, saveName, savedName } from '../net/identity'
import { makeRoomCode, type LobbySnapshot } from '../net/protocol'
import { GuestRoom, HostRoom, realPeerFactory } from '../net/room'
import type { Card } from '../types'
import type { DraftCtx } from './draft'
import { applyMatchAction, initMatch, type MatchAction, type MatchConfig, type MatchState } from './match'
import { loadTrophies, saveTrophy, type Trophy } from './trophies'

export type Screen = 'home' | 'themePick' | 'setup' | 'join' | 'lobby' | 'game' | 'trophies'
export type SessionMode = 'solo' | 'host' | 'guest'
export type NetStatus = 'idle' | 'connecting' | 'connected' | 'error'

export const DEFAULT_CONFIG: MatchConfig = { mode: 'themes', format: 'season', leagueSize: 4, seed: 0, theme: null }

interface GameStore {
  screen: Screen
  sessionMode: SessionMode | null
  myId: string
  myName: string
  pool: Card[] | null
  config: MatchConfig
  match: MatchState | null
  lobby: LobbySnapshot | null
  netStatus: NetStatus
  netError: string | null
  trophies: Trophy[]
  trophySaved: boolean
  autoSimming: boolean
  judgeArmed: boolean
  judging: boolean
  // What the on-the-clock drafter is typing right now (friends rooms).
  liveTyping: { playerId: string; text: string } | null

  setName: (name: string) => void
  setConfig: (config: Partial<MatchConfig>) => void
  armJudge: (key: string) => void
  disarmJudge: () => void
  goHome: () => void
  goSetup: (mode: 'solo' | 'host') => void
  goJoin: () => void
  goTrophies: () => void
  goThemePick: () => void
  startSolo: (theme: string | null) => Promise<void>
  createRoom: () => Promise<void>
  hostAddCpu: () => void
  hostStart: () => void
  joinRoom: (code: string) => Promise<void>
  dispatch: (action: MatchAction) => void
  sendTyping: (text: string) => void
  startCompetition: () => Promise<void>
  simAllRemaining: () => void
}

let hostRoom: HostRoom | null = null
let guestRoom: GuestRoom | null = null
let autoSimTimer: number | null = null
let typingLastSent = 0
let typingTimer: number | null = null

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
    // A snapshot means something happened - any live-typing ghost is stale.
    set({ lobby, match, netStatus: 'connected', screen: match ? 'game' : 'lobby', liveTyping: null })
    maybeRecordTrophy(match)
  }

  const applyTyping = (playerId: string, text: string) => {
    set({ liveTyping: { playerId, text } })
  }

  return {
    screen: 'home',
    sessionMode: null,
    myId: myPlayerId(),
    myName: savedName(),
    pool: null,
    config: { ...DEFAULT_CONFIG },
    match: null,
    lobby: null,
    netStatus: 'idle',
    netError: null,
    trophies: loadTrophies(),
    trophySaved: false,
    autoSimming: false,
    judgeArmed: judgeAvailable(),
    judging: false,
    liveTyping: null,

    setName: (name) => {
      saveName(name)
      set({ myName: name })
    },

    setConfig: (partial) => set({ config: { ...get().config, ...partial } }),

    armJudge: (key) => {
      saveJudgeKey(key)
      set({ judgeArmed: judgeAvailable() })
    },
    disarmJudge: () => {
      clearJudgeKey()
      set({ judgeArmed: judgeAvailable() })
    },

    goHome: () => {
      stopAutoSim(set)
      teardownNet()
      set({ screen: 'home', sessionMode: null, match: null, lobby: null, netStatus: 'idle', netError: null, trophySaved: false })
    },
    goSetup: (mode) => {
      void ensurePool(get, set) // the setup screen's theme menu needs it
      set({ screen: 'setup', sessionMode: mode, netError: null })
    },
    goJoin: () => set({ screen: 'join', sessionMode: 'guest', netError: null }),
    goTrophies: () => set({ screen: 'trophies' }),
    // The chase's theme picker; loads the pool so it can list what's deep
    // enough to play.
    goThemePick: () => {
      void ensurePool(get, set)
      set({ screen: 'themePick', sessionMode: 'solo', netError: null })
    },

    // Solo is the chase: draft under the theme (chosen or random), then
    // run 82 games and post a record.
    startSolo: async (theme) => {
      const pool = await ensurePool(get, set)
      const ctx: DraftCtx = { pool }
      const { myId, myName } = get()
      const config: MatchConfig = {
        mode: 'themes',
        format: 'chase',
        leagueSize: 1,
        seed: Math.floor(Math.random() * 2 ** 31),
        theme,
      }
      const match = initMatch(config, [{ id: myId, name: myName || 'YOU', isCpu: false }], ctx)
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
          onTyping: applyTyping,
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
          onTyping: applyTyping,
          onWelcome: () => set({ netStatus: 'connected' }),
          onRejected: (reason) => set({ netStatus: 'error', netError: reason }),
          onError: (message) => set({ netStatus: 'error', netError: message }),
        })
      } catch (err) {
        set({ netStatus: 'error', netError: err instanceof Error ? err.message : 'Failed to join room' })
      }
    },

    // Broadcast what I'm typing so everyone watches the clock ticking.
    // Throttled with a trailing flush so the wire stays light but the
    // last keystroke always lands. Solo goes nowhere.
    sendTyping: (text) => {
      const { sessionMode, match, myId } = get()
      if (sessionMode !== 'host' && sessionMode !== 'guest') return
      if (!match || match.phase !== 'draft') return
      const send = (t: string) => {
        if (sessionMode === 'guest') guestRoom?.sendTyping(myId, t)
        else hostRoom?.typingFrom(myId, myId, t)
      }
      if (typingTimer !== null) window.clearTimeout(typingTimer)
      const now = Date.now()
      if (now - typingLastSent >= 120) {
        typingLastSent = now
        send(text)
      } else {
        typingTimer = window.setTimeout(() => {
          typingLastSent = Date.now()
          send(text)
        }, 120)
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

    // Tip-off: if the judge is armed, run one scouting call first (host or
    // solo only), then begin. Any judge failure falls through silently.
    startCompetition: async () => {
      const { match, sessionMode, judging } = get()
      if (judging) return
      if (sessionMode === 'guest') return
      if (match && match.phase === 'preview' && match.judge === null && judgeAvailable()) {
        set({ judging: true })
        try {
          const theme = match.draft?.theme ? themeById(match.draft.theme) : null
          const context: JudgeContext = {
            ...(theme ? { themeLabel: theme.label, themeDetail: theme.detail } : {}),
            positionless: match.positionless,
          }
          const judgment = await judgeLeague(match.entries, match.rosters, context)
          if (judgment) get().dispatch({ type: 'SET_JUDGE', judgment })
        } finally {
          set({ judging: false })
        }
      }
      get().dispatch({ type: 'BEGIN_COMPETITION' })
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
      // The chase rips through its 82 games; league sims keep suspense.
      const cadence = get().match?.config.format === 'chase' ? 70 : 650
      autoSimTimer = window.setInterval(tick, cadence)
    },
  }
})
