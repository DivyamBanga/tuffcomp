import { useGameStore } from '../game/store'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function HistoryPanel() {
  const historyOpen = useGameStore((s) => s.historyOpen)
  const history = useGameStore((s) => s.history)
  const closeHistory = useGameStore((s) => s.closeHistory)

  if (!historyOpen) return null

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/85 backdrop-blur-sm" onClick={closeHistory}>
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl tracking-wide text-chalk">HISTORY</h3>
          <button
            type="button"
            onClick={closeHistory}
            className="font-display text-sm tracking-wide text-mist hover:text-chalk"
          >
            CLOSE
          </button>
        </div>

        {history.length === 0 && (
          <p className="py-10 text-center text-sm text-mist">
            No completed XIs yet. Finish building a lineup to start your history.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {history.map((result) => (
            <li
              key={result.id}
              className="flex items-center justify-between rounded-xl bg-ink-soft px-4 py-3"
            >
              <span className="flex flex-col">
                <span className="text-xs uppercase tracking-widest text-mist">{formatDate(result.playedAt)}</span>
                <span className="line-clamp-1 max-w-[14rem] text-xs text-mist">{result.summary}</span>
              </span>
              <span className="flex items-center gap-2">
                {result.isNewBest && <span className="font-display text-xs tracking-widest text-gold">BEST</span>}
                <span className="font-display text-2xl text-chalk">{result.rating}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
