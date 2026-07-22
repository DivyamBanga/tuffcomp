import { create } from 'zustand'
import { loadSquads } from '../data/loadSquads'
import { FORMATION_433 } from '../engine/formations'
import type { Player, Squad } from '../types'

type SquadsStatus = 'loading' | 'ready' | 'error'

interface GameState {
  squadsStatus: SquadsStatus
  allSquads: Squad[]

  // The lineup being built: one real Player per slot, or null while empty.
  assignments: Record<string, Player | null>

  // The slot currently being filled via spin, and the squad that spin has
  // landed on (null while the spin animation is still running).
  pendingSlotId: string | null
  pendingSquad: Squad | null

  initSquads: () => Promise<void>
  startSpinFor: (slotId: string) => void
  revealForSlot: () => void
  rerollPending: () => void
  cancelPending: () => void
  pickPlayer: (player: Player) => void
  clearSlot: (slotId: string) => void
  reset: () => void
}

function emptyAssignments(): Record<string, Player | null> {
  return Object.fromEntries(FORMATION_433.slots.map((s) => [s.id, null]))
}

function randomSquad(squads: Squad[]): Squad {
  return squads[Math.floor(Math.random() * squads.length)]
}

export const useGameStore = create<GameState>((set, get) => ({
  squadsStatus: 'loading',
  allSquads: [],
  assignments: emptyAssignments(),
  pendingSlotId: null,
  pendingSquad: null,

  initSquads: async () => {
    if (get().squadsStatus === 'ready') return
    try {
      const squads = await loadSquads()
      set({ allSquads: squads, squadsStatus: 'ready' })
    } catch {
      set({ squadsStatus: 'error' })
    }
  },

  startSpinFor: (slotId) => set({ pendingSlotId: slotId, pendingSquad: null }),

  revealForSlot: () => {
    const { allSquads } = get()
    if (allSquads.length === 0) return
    set({ pendingSquad: randomSquad(allSquads) })
  },

  rerollPending: () => {
    const { allSquads, pendingSlotId } = get()
    if (!pendingSlotId || allSquads.length === 0) return
    set({ pendingSquad: randomSquad(allSquads) })
  },

  cancelPending: () => set({ pendingSlotId: null, pendingSquad: null }),

  pickPlayer: (player) => {
    const { pendingSlotId, assignments } = get()
    if (!pendingSlotId) return
    const next = { ...assignments }
    // a player can only occupy one slot at a time
    for (const key of Object.keys(next)) {
      if (next[key]?.id === player.id) next[key] = null
    }
    next[pendingSlotId] = player
    set({ assignments: next, pendingSlotId: null, pendingSquad: null })
  },

  clearSlot: (slotId) => set((state) => ({ assignments: { ...state.assignments, [slotId]: null } })),

  reset: () => set({ assignments: emptyAssignments(), pendingSlotId: null, pendingSquad: null }),
}))
