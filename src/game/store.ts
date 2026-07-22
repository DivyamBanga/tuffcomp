import { create } from 'zustand'
import { SQUADS } from '../data/loadSquads'
import { FORMATIONS, type Formation } from '../engine/formations'
import type { Squad } from '../types'

type Phase = 'spin' | 'reveal' | 'build'

interface GameState {
  phase: Phase
  squad: Squad | null
  formationId: string
  assignments: Record<string, string | null>

  spinSquad: () => void
  confirmReveal: () => void
  setFormation: (formationId: string) => void
  assignPlayer: (slotId: string, playerId: string) => void
  clearSlot: (slotId: string) => void
  reset: () => void
}

function emptyAssignments(formation: Formation): Record<string, string | null> {
  return Object.fromEntries(formation.slots.map((s) => [s.id, null]))
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'spin',
  squad: null,
  formationId: FORMATIONS[0].id,
  assignments: {},

  spinSquad: () => {
    const squad = SQUADS[Math.floor(Math.random() * SQUADS.length)]
    const formation = FORMATIONS.find((f) => f.id === get().formationId) ?? FORMATIONS[0]
    set({ squad, assignments: emptyAssignments(formation), phase: 'reveal' })
  },

  confirmReveal: () => set({ phase: 'build' }),

  setFormation: (formationId) => {
    const formation = FORMATIONS.find((f) => f.id === formationId)
    if (!formation) return
    set({ formationId, assignments: emptyAssignments(formation) })
  },

  assignPlayer: (slotId, playerId) => {
    set((state) => {
      const assignments = { ...state.assignments }
      // a player can only occupy one slot at a time
      for (const key of Object.keys(assignments)) {
        if (assignments[key] === playerId) assignments[key] = null
      }
      assignments[slotId] = playerId
      return { assignments }
    })
  },

  clearSlot: (slotId) => {
    set((state) => ({ assignments: { ...state.assignments, [slotId]: null } }))
  },

  reset: () =>
    set({ phase: 'spin', squad: null, formationId: FORMATIONS[0].id, assignments: {} }),
}))
