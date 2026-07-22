import { useGameStore } from './game/store'
import { PitchScreen } from './ui/PitchScreen'
import { RevealScreen } from './ui/RevealScreen'
import { SpinScreen } from './ui/SpinScreen'

function App() {
  const phase = useGameStore((s) => s.phase)

  return (
    <div className="grain min-h-screen bg-ink font-sans text-chalk">
      {phase === 'spin' && <SpinScreen />}
      {phase === 'reveal' && <RevealScreen />}
      {phase === 'build' && <PitchScreen />}
    </div>
  )
}

export default App
