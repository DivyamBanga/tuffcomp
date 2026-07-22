import { useEffect } from 'react'
import { useGameStore } from './game/store'
import { BuildScreen } from './ui/BuildScreen'

function App() {
  const squadsStatus = useGameStore((s) => s.squadsStatus)
  const initSquads = useGameStore((s) => s.initSquads)

  useEffect(() => {
    initSquads()
  }, [initSquads])

  return (
    <div className="grain min-h-screen bg-ink font-sans text-chalk">
      {squadsStatus === 'loading' && (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3">
          <p className="font-display text-sm tracking-[0.5em] text-lime">TUFFCOMP</p>
          <p className="font-display animate-pulse text-2xl tracking-wide text-chalk">LOADING SQUADS…</p>
        </div>
      )}
      {squadsStatus === 'error' && (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-display text-2xl tracking-wide text-chalk">Couldn't load squad data.</p>
          <p className="text-sm text-mist">Check your connection and reload the page.</p>
        </div>
      )}
      {squadsStatus === 'ready' && <BuildScreen />}
    </div>
  )
}

export default App
