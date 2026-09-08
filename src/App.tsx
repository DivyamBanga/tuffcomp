import { useSyncExternalStore } from 'react'
import { useGame } from './game/store'
import { ChampionScreen, PlayoffsScreen, SeasonScreen, TrophiesScreen } from './ui/CompetitionScreens'
import { DraftScreen } from './ui/DraftScreen'
import { HomeScreen, JoinScreen, LobbyScreen, ScoutScreen, SetupScreen, ThemePickScreen } from './ui/MenuScreens'
import { PartyDraftScreen } from './ui/PartyScreens'
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
      return match.party ? <PartyDraftScreen match={match} /> : <DraftScreen match={match} />
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

// A thin strip across the top of every room screen when the network is
// not right: the host has lost the room server (new friends can't get in
// until it's back - existing ones keep playing), or a guest lost the host.
function NetBanner() {
  const sessionMode = useGame((s) => s.sessionMode)
  const brokerOnline = useGame((s) => s.brokerOnline)
  const netStatus = useGame((s) => s.netStatus)
  const netError = useGame((s) => s.netError)
  const screen = useGame((s) => s.screen)
  if (screen !== 'lobby' && screen !== 'game') return null
  const hostOffline = sessionMode === 'host' && !brokerOnline
  const guestLost = sessionMode === 'guest' && netStatus === 'error'
  if (!hostOffline && !guestLost) return null
  return (
    <div className="sticky top-0 z-20 border-b border-hot bg-paper2 px-3 py-1.5 text-center">
      <span className="plate animate-pulse !text-[9px] text-hot">
        {hostOffline ? 'ROOM OFFLINE · RECONNECTING… · NEW JOINS WAIT, THE GAME GOES ON' : `CONNECTION LOST · ${netError ?? ''}`}
      </span>
    </div>
  )
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
      <NetBanner />
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
