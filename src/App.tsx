import { useSyncExternalStore } from 'react'
import { useGame } from './game/store'
import { ChampionScreen, PlayoffsScreen, SeasonScreen, TrophiesScreen } from './ui/CompetitionScreens'
import { DraftScreen } from './ui/DraftScreen'
import { HomeScreen, JoinScreen, LobbyScreen, ScoutScreen, SetupScreen, ThemePickScreen } from './ui/MenuScreens'
import { PreviewScreen } from './ui/PreviewScreen'

// The hidden #scout page (arming the AI scout) rides the URL hash.
const subscribeHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
function useHash(): string {
  return useSyncExternalStore(subscribeHash, () => window.location.hash)
}

function GameRouter() {
  const match = useGame((s) => s.match)
  if (!match) return <HomeScreen />
  switch (match.phase) {
    case 'draft':
      return <DraftScreen match={match} />
    case 'preview':
      return <PreviewScreen match={match} />
    case 'season':
      return <SeasonScreen match={match} />
    case 'playoffs':
      return <PlayoffsScreen match={match} />
    case 'done':
      return <ChampionScreen match={match} />
  }
}

function App() {
  const screen = useGame((s) => s.screen)
  const hash = useHash()
  if (hash === '#scout' && screen === 'home') {
    return (
      <div className="min-h-screen">
        <ScoutScreen />
      </div>
    )
  }
  return (
    <div className="min-h-screen">
      {screen === 'home' && <HomeScreen />}
      {screen === 'themePick' && <ThemePickScreen />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'join' && <JoinScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'trophies' && <TrophiesScreen />}
      {screen === 'game' && <GameRouter />}
    </div>
  )
}

export default App
