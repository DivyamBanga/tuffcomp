import { useGameStore } from '../game/store'

const COMPONENT_LABELS: { key: 'quality' | 'fit' | 'chemistry' | 'balance'; label: string }[] = [
  { key: 'quality', label: 'Quality' },
  { key: 'fit', label: 'Fit' },
  { key: 'chemistry', label: 'Chemistry' },
  { key: 'balance', label: 'Balance' },
]

export function ResultsPanel() {
  const resultsOpen = useGameStore((s) => s.resultsOpen)
  const lastResult = useGameStore((s) => s.lastResult)
  const closeResults = useGameStore((s) => s.closeResults)
  const openHistory = useGameStore((s) => s.openHistory)
  const reset = useGameStore((s) => s.reset)

  if (!resultsOpen || !lastResult) return null

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/85 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-panel p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-2xl tracking-wide text-chalk">RESULTS</h3>
          <button
            type="button"
            onClick={closeResults}
            className="font-display text-sm tracking-wide text-mist hover:text-chalk"
          >
            CLOSE
          </button>
        </div>

        <div className="flex flex-col items-center gap-1 py-4">
          {lastResult.isNewBest && (
            <span className="rounded-full bg-gold px-3 py-1 font-display text-xs tracking-widest text-ink">
              NEW BEST
            </span>
          )}
          <span className="font-display text-7xl leading-none text-lime">{lastResult.rating}</span>
          <span className="text-xs uppercase tracking-widest text-mist">Overall Rating</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {COMPONENT_LABELS.map(({ key, label }) => (
            <div key={key} className="rounded-xl bg-ink-soft px-4 py-3">
              <p className="text-xs uppercase tracking-widest text-mist">{label}</p>
              <p className="font-display text-3xl text-chalk">{lastResult[key]}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm leading-relaxed text-chalk/90">{lastResult.summary}</p>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              closeResults()
              openHistory()
            }}
            className="flex-1 rounded-full border border-white/15 py-3 font-display text-sm tracking-wide text-mist transition hover:border-white/30 hover:text-chalk"
          >
            HISTORY
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-full bg-lime py-3 font-display text-sm tracking-wide text-ink transition hover:bg-lime-dim"
          >
            PLAY AGAIN
          </button>
        </div>
      </div>
    </div>
  )
}
