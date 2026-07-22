import { create } from 'zustand'
import { loadSquads } from '../data/loadSquads'
import { FORMATION_433 } from '../engine/formations'
import { bestCompatibility } from '../engine/positions'
import type { Player, Squad } from '../types'

type SquadsStatus = 'loading' | 'ready' | 'error'

interface GameState {
  squadsStatus: SquadsStatus
  allSquads: Squad[]

  // The lineup being built: one real Player per slot, or null while empty.
  assignments: Record<string, Player | null>

  // Spin sheet: open while spinning or browsing a revealed roster.
  // pendingSquad is null while the spin animation is still running.
  spinOpen: boolean
  pendingSquad: Squad | null

  // A player picked off a revealed roster, waiting to be placed on the pitch.
  pendingPlayer: Player | null

  initSquads: () => Promise<void>
  startSpin: () => void
  revealSquad: () => void
  rerollSquad: () => void
  cancelSpin: () => void
  selectPlayer: (player: Player) => void
  cancelPlacement: () => void
  placeInSlot: (slotId: string) => void
  clearSlot: (slotId: string) => void
  reset: () => void
}

function emptyAssignments(): Record<string, Player | null> {
  return Object.fromEntries(FORMATION_433.slots.map((s) => [s.id, null]))
}

function randomSquad(squads: Squad[]): Squad {
  return squads[Math.floor(Math.random() * squads.length)]
}

// Is there any open slot on the pitch this player could actually be placed in?
export function hasEligibleOpenSlot(player: Player, assignments: Record<string, Player | null>): boolean {
  return FORMATION_433.slots.some(
    (slot) => assignments[slot.id] === null && bestCompatibility(player.positions, slot.position) > 0,
  )
}

export const useGameStore = create<GameState>((set, get) => ({
  squadsStatus: 'loading',
  allSquads: [],
  assignments: emptyAssignments(),
  spinOpen: false,
  pendingSquad: null,
  pendingPlayer: null,

  initSquads: async () => {
    if (get().squadsStatus === 'ready') return
    try {
      const squads = await loadSquads()
      set({ allSquads: squads, squadsStatus: 'ready' })
    } catch {
      set({ squadsStatus: 'error' })
    }
  },

  startSpin: () => set({ spinOpen: true, pendingSquad: null }),

  revealSquad: () => {
    const { allSquads } = get()
    if (allSquads.length === 0) return
    set({ pendingSquad: randomSquad(allSquads) })
  },

  rerollSquad: () => {
    const { allSquads, spinOpen } = get()
    if (!spinOpen || allSquads.length === 0) return
    set({ pendingSquad: randomSquad(allSquads) })
  },

  cancelSpin: () => set({ spinOpen: false, pendingSquad: null }),

  selectPlayer: (player) => set({ spinOpen: false, pendingSquad: null, pendingPlayer: player }),

  cancelPlacement: () => set({ pendingPlayer: null }),

  placeInSlot: (slotId) => {
    const { pendingPlayer, assignments } = get()
    if (!pendingPlayer) return
    const next = { ...assignments }
    // a player can only occupy one slot at a time
    for (const key of Object.keys(next)) {
      if (next[key]?.id === pendingPlayer.id) next[key] = null
    }
    next[slotId] = pendingPlayer
    set({ assignments: next, pendingPlayer: null })
  },

  clearSlot: (slotId) => set((state) => ({ assignments: { ...state.assignments, [slotId]: null } })),

  reset: () =>
    set({ assignments: emptyAssignments(), spinOpen: false, pendingSquad: null, pendingPlayer: null }),
}))
