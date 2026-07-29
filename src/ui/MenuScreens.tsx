import { useState } from 'react'
import { useGame } from '../game/store'
import { normalizeRoomCode } from '../net/protocol'
import { JumboPanel, LedTicker, NeonButton } from './components'

// -------------------------------------------------------------------- home

const TITLE = 'RING CHASERS'

export function HomeScreen() {
  const { myName, setName, goSetup, goJoin, goTrophies, trophies } = useGame()
  const rings = trophies.filter((t) => t.championWasMe).length

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <p className="font-led text-[11px] font-bold tracking-[0.5em] text-mist">ALL-TIME NBA DRAFT ARCADE</p>
        <h1 className="mt-2 font-display text-6xl leading-none tracking-wide sm:text-7xl" aria-label={TITLE}>
          {TITLE.split('').map((ch, i) => (
            <span
              key={i}
              className="neon-text animate-flicker-in inline-block"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </h1>
        {rings > 0 && (
          <p className="mt-2 font-led text-xs tracking-[0.3em] text-gold">
            {'🏆'.repeat(Math.min(rings, 8))} {rings} RING{rings > 1 ? 'S' : ''} WON
          </p>
        )}
      </div>

      <LedTicker text="SPIN REAL LEGENDS 1980-2026 · DRAFT YOUR SQUAD · SIM THE SEASON · WIN THE RING" />

      <JumboPanel>
        <label className="mb-4 block">
          <span className="mb-1 block font-led text-[10px] tracking-[0.3em] text-mist">YOUR NAME</span>
          <input
            value={myName}
            onChange={(e) => setName(e.target.value.slice(0, 14))}
            placeholder="ENTER NAME"
            className="w-full rounded-lg border border-bezel bg-panel-deep px-4 py-3 font-display text-xl tracking-widest text-chalk outline-none placeholder:text-mist/50 focus:border-neon"
          />
        </label>
        <div className="grid gap-3">
          <NeonButton onClick={() => goSetup('solo')}>PLAY SOLO VS CPU</NeonButton>
          <NeonButton color="ember" onClick={() => goSetup('host')}>
            CREATE ONLINE ROOM
          </NeonButton>
          <NeonButton color="ice" onClick={goJoin}>
            JOIN WITH A CODE
          </NeonButton>
          <button type="button" onClick={goTrophies} className="mt-1 font-led text-[11px] tracking-[0.3em] text-mist hover:text-gold">
            🏆 TROPHY CASE
          </button>
        </div>
      </JumboPanel>

      <p className="text-center font-led text-[9px] leading-relaxed tracking-widest text-mist/70">
        REAL PLAYERS · REAL STATS · STATS FROM BASKETBALL REFERENCE DATA · PHOTOS © NBA
      </p>
    </div>
  )
}

// ------------------------------------------------------------------- setup

export function SetupScreen() {
  const { sessionMode, config, setConfig, cpuDrafters, setCpuDrafters, startSolo, createRoom, goHome, netStatus, netError } = useGame()
  const solo = sessionMode === 'solo'
  const sizes = config.format === 'series' ? [2, 4, 8] : [4, 6, 8]

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-center font-display text-4xl tracking-wide text-chalk">
        {solo ? 'SOLO RUN' : 'CREATE ROOM'}
      </h1>

      <JumboPanel title="DRAFT STYLE">
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            active={config.mode === 'tiers'}
            title="TIERED SPINS"
            tag="FAIR & EVEN"
            body="Everyone climbs the same rarity ladder. Round 1 guarantees a star. Last round is a jackpot wildcard."
            onClick={() => setConfig({ mode: 'tiers' })}
          />
          <ModeCard
            active={config.mode === 'franchise'}
            title="FRANCHISE SPINS"
            tag="PURE CHAOS"
            body="Spin a real franchise era - 90s Bulls, 2017 Warriors, Showtime Lakers - and grab anyone still available."
            onClick={() => setConfig({ mode: 'franchise' })}
          />
        </div>
      </JumboPanel>

      <JumboPanel title="COMPETITION">
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            active={config.format === 'season'}
            title="SEASON + PLAYOFFS"
            tag="THE FULL DREAM"
            body="Round-robin season, standings, seeding, then a playoff bracket to crown the champ."
            onClick={() => setConfig({ format: 'season', leagueSize: [4, 6, 8].includes(config.leagueSize) ? config.leagueSize : 4 })}
          />
          <ModeCard
            active={config.format === 'series'}
            title="STRAIGHT PLAYOFFS"
            tag="QUICK & DEADLY"
            body="Skip the season. Seeded by team power, best-of-7 series, win or go home."
            onClick={() => setConfig({ format: 'series', leagueSize: [2, 4, 8].includes(config.leagueSize) ? config.leagueSize : 4 })}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="font-led text-[10px] tracking-[0.3em] text-mist">LEAGUE SIZE</span>
          {sizes.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setConfig({ leagueSize: n })}
              className={`btn-arcade px-4 py-1.5 font-led text-sm font-bold ${config.leagueSize === n ? 'bg-neon text-arena' : 'bg-panel-deep text-mist'}`}
            >
              {n}
            </button>
          ))}
          <span className="font-led text-[9px] tracking-widest text-mist/70">CPU TEAMS FILL EMPTY SPOTS</span>
        </div>
        {solo && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="font-led text-[10px] tracking-[0.3em] text-mist">LIVE CPU DRAFTERS</span>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCpuDrafters(n)}
                className={`btn-arcade px-4 py-1.5 font-led text-sm font-bold ${cpuDrafters === n ? 'bg-ice text-arena' : 'bg-panel-deep text-mist'}`}
              >
                {n}
              </button>
            ))}
            <span className="font-led text-[9px] tracking-widest text-mist/70">THEY SPIN AND PICK LIKE YOU DO</span>
          </div>
        )}
      </JumboPanel>

      {netError && <p className="text-center font-led text-xs tracking-widest text-ember">{netError}</p>}

      <div className="flex justify-center gap-3">
        <NeonButton color="steel" onClick={goHome}>
          BACK
        </NeonButton>
        {solo ? (
          <NeonButton onClick={startSolo}>TIP-OFF →</NeonButton>
        ) : (
          <NeonButton onClick={createRoom} disabled={netStatus === 'connecting'}>
            {netStatus === 'connecting' ? 'OPENING…' : 'OPEN ROOM →'}
          </NeonButton>
        )}
      </div>
    </div>
  )
}

function ModeCard({ active, title, tag, body, onClick }: { active: boolean; title: string; tag: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        active ? 'border-neon bg-neon/10 shadow-[0_0_24px_-8px_rgba(255,179,0,0.5)]' : 'border-bezel bg-panel-deep hover:border-chalk/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-xl tracking-wide text-chalk">{title}</span>
        <span className={`font-led text-[9px] font-bold tracking-[0.2em] ${active ? 'text-neon' : 'text-mist'}`}>{tag}</span>
      </div>
      <p className="mt-1.5 text-sm leading-snug text-mist">{body}</p>
    </button>
  )
}

// -------------------------------------------------------------------- join

export function JoinScreen() {
  const { joinRoom, goHome, netStatus, netError } = useGame()
  const [code, setCode] = useState('')

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <h1 className="text-center font-display text-4xl tracking-wide text-chalk">JOIN A ROOM</h1>
      <JumboPanel>
        <label className="block text-center">
          <span className="mb-2 block font-led text-[10px] tracking-[0.3em] text-mist">4-LETTER ROOM CODE</span>
          <input
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            placeholder="ABCD"
            autoFocus
            className="w-48 rounded-lg border border-bezel bg-panel-deep px-4 py-4 text-center font-led text-4xl font-black tracking-[0.4em] text-neon outline-none placeholder:text-mist/30 focus:border-neon"
          />
        </label>
        {netStatus === 'connecting' && (
          <p className="animate-pulse-glow mt-3 text-center font-led text-xs tracking-[0.3em] text-ice">CONNECTING…</p>
        )}
        {netError && <p className="mt-3 text-center font-led text-xs tracking-widest text-ember">{netError}</p>}
      </JumboPanel>
      <div className="flex justify-center gap-3">
        <NeonButton color="steel" onClick={goHome}>
          BACK
        </NeonButton>
        <NeonButton color="ice" onClick={() => joinRoom(code)} disabled={code.length !== 4 || netStatus === 'connecting'}>
          CONNECT →
        </NeonButton>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- lobby

export function LobbyScreen() {
  const { lobby, myId, hostAddCpu, hostStart, goHome, sessionMode } = useGame()
  if (!lobby) return null
  const isHost = sessionMode === 'host'

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-5 px-4 py-10">
      <div className="text-center">
        <p className="font-led text-[10px] tracking-[0.4em] text-mist">ROOM CODE</p>
        <p className="neon-text mt-1 font-led text-7xl font-black tracking-[0.25em]">{lobby.code}</p>
        <p className="mt-2 text-sm text-mist">Friends open the game and hit JOIN WITH A CODE</p>
      </div>

      <JumboPanel title={`SQUAD UP (${lobby.players.length}/8)`}>
        <ul className="grid gap-2">
          {lobby.players.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg border border-bezel bg-panel-deep px-4 py-2.5">
              <span className="font-display text-lg tracking-wide text-chalk">
                {p.name}
                {p.id === myId && <span className="ml-2 font-led text-[9px] text-neon">YOU</span>}
                {i === 0 && <span className="ml-2 font-led text-[9px] text-gold">HOST</span>}
                {p.isCpu && <span className="ml-2 font-led text-[9px] text-ice">CPU</span>}
              </span>
              <span className="animate-pulse-glow h-2 w-2 rounded-full bg-starter" />
            </li>
          ))}
        </ul>
        {isHost && (
          <div className="mt-3 flex gap-2">
            <NeonButton color="steel" className="!px-4 !py-2 !text-sm" onClick={hostAddCpu}>
              + ADD BOT
            </NeonButton>
          </div>
        )}
      </JumboPanel>

      <div className="flex justify-center gap-3">
        <NeonButton color="steel" onClick={goHome}>
          LEAVE
        </NeonButton>
        {isHost ? (
          <NeonButton onClick={hostStart} disabled={lobby.players.length < 2}>
            START DRAFT →
          </NeonButton>
        ) : (
          <p className="animate-pulse-glow self-center font-led text-xs tracking-[0.3em] text-mist">WAITING FOR HOST…</p>
        )}
      </div>
    </div>
  )
}
