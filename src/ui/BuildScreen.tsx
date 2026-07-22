import { FORMATION_433 } from '../engine/formations'
import { useGameStore } from '../game/store'
import { Pitch } from './Pitch'
import { SpinPickSheet } from './SpinPickSheet'

export function BuildScreen() {
  const assignments = useGameStore((s) => s.assignments)
  const spinOpen = useGameStore((s) => s.spinOpen)
  const pendingPlayer = useGameStore((s) => s.pendingPlayer)
  const startSpin = useGameStore((s) => s.startSpin)
  const cancelPlacement = useGameStore((s) => s.cancelPlacement)
  const placeInSlot = useGameStore((s) => s.placeInSlot)
  const clearSlot = useGameStore((s) => s.clearSlot)
  const reset = useGameStore((s) => s.reset)

  const filledCount = Object.values(assignments).filter(Boolean).length
  const isFull = filledCount === FORMATION_433.slots.length

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

      <p className="mt-2 text-center font-display text-sm tracking-[0.3em] text-gold">
        {filledCount} / {FORMATION_433.slots.length} FILLED
      </p>

      {pendingPlayer ? (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-lime/40 bg-lime/10 px-4 py-3">
          <span className="text-sm text-chalk">
            Placing <span className="font-semibold">{pendingPlayer.name}</span> - tap a highlighted slot
          </span>
          <button
            type="button"
            onClick={cancelPlacement}
            className="font-display text-xs tracking-wide text-mist hover:text-chalk"
          >
            CANCEL
          </button>
        </div>
      ) : (
        <p className="mt-3 text-center text-sm text-mist">
          Spin a real World Cup squad, take one player from it, then place them on the pitch.
        </p>
      )}

      <Pitch
        assignments={assignments}
        pendingPlayer={pendingPlayer}
        onEligibleSlotClick={placeInSlot}
        onFilledSlotClick={clearSlot}
      />

      {!pendingPlayer && (
        <button
          type="button"
          onClick={startSpin}
          disabled={isFull || spinOpen}
          className="mx-auto mt-4 rounded-full bg-lime px-10 py-4 font-display text-xl tracking-wide text-ink transition hover:bg-lime-dim disabled:opacity-40"
        >
          {isFull ? 'XI COMPLETE' : 'SPIN'}
        </button>
      )}

      <SpinPickSheet />
    </div>
  )
}
