import { FORMATION_433 } from '../engine/formations'
import { rateTeam } from '../engine/rating'
import { buildTeam } from '../engine/team'
import { useGameStore } from '../game/store'
import { bestRating } from '../game/persistence'
import { HistoryPanel } from './HistoryPanel'
import { Pitch } from './Pitch'
import { ResultsPanel } from './ResultsPanel'
import { SpinPickSheet } from './SpinPickSheet'

export function BuildScreen() {
  const assignments = useGameStore((s) => s.assignments)
  const spinOpen = useGameStore((s) => s.spinOpen)
  const pendingPlayer = useGameStore((s) => s.pendingPlayer)
  const history = useGameStore((s) => s.history)
  const startSpin = useGameStore((s) => s.startSpin)
  const cancelPlacement = useGameStore((s) => s.cancelPlacement)
  const placeInSlot = useGameStore((s) => s.placeInSlot)
  const clearSlot = useGameStore((s) => s.clearSlot)
  const openResults = useGameStore((s) => s.openResults)
  const openHistory = useGameStore((s) => s.openHistory)
  const reset = useGameStore((s) => s.reset)

  const filledCount = Object.values(assignments).filter(Boolean).length
  const isFull = filledCount === FORMATION_433.slots.length

  const liveTeam = buildTeam(assignments)
  const live = liveTeam.length > 0 ? rateTeam(liveTeam) : null
  const best = bestRating(history)

  return (
    <div className="relative z-10 flex min-h-screen flex-col pb-10">
      <header className="flex items-center justify-between gap-2 px-4 pt-5">
        <div>
          <p className="font-display text-sm tracking-[0.5em] text-lime">TUFFCOMP</p>
          <h1 className="font-display text-2xl tracking-wide text-chalk">BUILD YOUR XI</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={openHistory}
            className="font-display text-sm tracking-wide text-mist hover:text-chalk"
          >
            HISTORY
          </button>
          <button
            type="button"
            onClick={reset}
            className="font-display text-sm tracking-wide text-mist hover:text-chalk"
          >
            RESET
          </button>
        </div>
      </header>

      <div className="mt-2 flex items-center justify-center gap-4">
        <p className="font-display text-sm tracking-[0.3em] text-gold">
          {filledCount} / {FORMATION_433.slots.length} FILLED
        </p>
        {best !== null && (
          <p className="font-display text-sm tracking-[0.3em] text-mist">BEST {best}</p>
        )}
      </div>

      {live && (
        <p className="mt-1 text-center font-display text-lg tracking-wide text-chalk">
          Current rating: <span className="text-lime">{live.rating}</span>
        </p>
      )}

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
        !live && (
          <p className="mt-3 text-center text-sm text-mist">
            Spin a real World Cup squad, take one player from it, then place them on the pitch.
          </p>
        )
      )}

      <Pitch
        assignments={assignments}
        pendingPlayer={pendingPlayer}
        onEligibleSlotClick={placeInSlot}
        onFilledSlotClick={clearSlot}
      />

      {!pendingPlayer &&
        (isFull ? (
          <button
            type="button"
            onClick={openResults}
            className="mx-auto mt-4 rounded-full bg-lime px-10 py-4 font-display text-xl tracking-wide text-ink transition hover:bg-lime-dim"
          >
            VIEW RESULTS
          </button>
        ) : (
          <button
            type="button"
            onClick={startSpin}
            disabled={spinOpen}
            className="mx-auto mt-4 rounded-full bg-lime px-10 py-4 font-display text-xl tracking-wide text-ink transition hover:bg-lime-dim disabled:opacity-40"
          >
            SPIN
          </button>
        ))}

      <SpinPickSheet />
      <ResultsPanel />
      <HistoryPanel />
    </div>
  )
}
