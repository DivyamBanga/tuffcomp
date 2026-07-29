import { useGame } from './game/store'
import { ChampionScreen, PlayoffsScreen, SeasonScreen, TrophiesScreen } from './ui/CompetitionScreens'
import { DraftScreen } from './ui/DraftScreen'
import { HomeScreen, JoinScreen, LobbyScreen, SetupScreen } from './ui/MenuScreens'
import { PreviewScreen } from './ui/PreviewScreen'

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
  return (
    <div className="grain min-h-screen">
      {screen === 'home' && <HomeScreen />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'join' && <JoinScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'trophies' && <TrophiesScreen />}
      {screen === 'game' && <GameRouter />}
    </div>
  )
}

export default App
