import { FORMATION_433 } from '../engine/formations'
import { useGameStore } from '../game/store'
import { Pitch } from './Pitch'
import { SpinPickSheet } from './SpinPickSheet'

export function BuildScreen() {
  const assignments = useGameStore((s) => s.assignments)
  const startSpinFor = useGameStore((s) => s.startSpinFor)
  const clearSlot = useGameStore((s) => s.clearSlot)
  const reset = useGameStore((s) => s.reset)

  const filledCount = Object.values(assignments).filter(Boolean).length

  return (
    <div className="relative z-10 flex min-h-screen flex-col pb-10">
      <header className="flex items-center justify-between gap-2 px-4 pt-5">
        <div>
          <p className="font-display text-sm tracking-[0.5em] text-lime">TUFFCOMP</p>
          <h1 className="font-display text-2xl tracking-wide text-chalk">BUILD YOUR XI</h1>
        </div>
        <button
          type="button"
          onClick={reset}
          className="font-display text-sm tracking-wide text-mist hover:text-chalk"
        >
          RESET
        </button>
      </header>

      <p className="mt-3 text-center text-sm text-mist">
        Tap an empty slot to spin a real World Cup squad and take one player from it.
      </p>

      <p className="mt-2 text-center font-display text-sm tracking-[0.3em] text-gold">
        {filledCount} / {FORMATION_433.slots.length} FILLED
      </p>

      <Pitch assignments={assignments} onEmptySlotClick={startSpinFor} onFilledSlotClick={clearSlot} />

      <SpinPickSheet />
    </div>
  )
}
