import { useState } from 'react'
import { FORMATIONS } from '../engine/formations'
import { useGameStore } from '../game/store'
import { Pitch } from './Pitch'
import { flagFor } from './flags'
import { PlayerPicker } from './PlayerPicker'

export function PitchScreen() {
  const squad = useGameStore((s) => s.squad)
  const formationId = useGameStore((s) => s.formationId)
  const assignments = useGameStore((s) => s.assignments)
  const setFormation = useGameStore((s) => s.setFormation)
  const reset = useGameStore((s) => s.reset)
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)

  const formation = FORMATIONS.find((f) => f.id === formationId) ?? FORMATIONS[0]
  if (!squad) return null

  const filledCount = Object.values(assignments).filter(Boolean).length

  return (
    <div className="relative z-10 flex min-h-screen flex-col pb-10">
      <header className="flex items-center justify-between gap-2 px-4 pt-5">
        <button
          type="button"
          onClick={reset}
          className="font-display text-sm tracking-wide text-mist hover:text-chalk"
        >
          ← SPIN AGAIN
        </button>
        <span className="flex items-center gap-2 font-display text-sm tracking-wide text-chalk">
          {flagFor(squad.team)} {squad.team} {squad.year}
        </span>
      </header>

      <div className="mx-auto mt-4 flex items-center gap-1 rounded-full border border-white/10 bg-panel p-1">
        {FORMATIONS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFormation(f.id)}
            className={`rounded-full px-4 py-1.5 font-display text-sm tracking-wide transition ${
              f.id === formationId ? 'bg-lime text-ink' : 'text-mist hover:text-chalk'
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      <p className="mt-2 text-center font-display text-sm tracking-[0.3em] text-gold">
        {filledCount} / {formation.slots.length} FILLED
      </p>

      <Pitch formation={formation} squad={squad} assignments={assignments} onSlotClick={setActiveSlotId} />

      {activeSlotId && (
        <PlayerPicker
          squad={squad}
          formation={formation}
          slotId={activeSlotId}
          assignments={assignments}
          onClose={() => setActiveSlotId(null)}
        />
      )}
    </div>
  )
}
