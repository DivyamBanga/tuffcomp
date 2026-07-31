import { useState } from 'react'
import { useGame } from '../game/store'
import { normalizeRoomCode } from '../net/protocol'
import { Btn, RingSeal, Sheet, StatusLine } from './components'

// -------------------------------------------------------------------- home

export function HomeScreen() {
  const { myName, setName, goSetup, goJoin, goTrophies, trophies } = useGame()
  const rings = trophies.filter((t) => t.championWasMe).length

  const menu = [
    { n: '01', label: 'PLAY SOLO VS CPU', hint: 'Draft against bots, sim to a ring', go: () => goSetup('solo') },
    { n: '02', label: 'CREATE ONLINE ROOM', hint: 'Host a room, share a 4-letter code', go: () => goSetup('host') },
    { n: '03', label: 'JOIN WITH A CODE', hint: 'Hop into a friend’s draft', go: goJoin },
  ]

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-5 px-4 py-10">
      <div className="animate-rise relative text-center">
        <div className="relative inline-block">
          <h1 className="headline text-6xl leading-none text-ink sm:text-7xl">
            RING
            <br />
            CHASERS
          </h1>
          <RingSeal size={54} strokeWidth={4} className="absolute -right-8 -top-4 sm:-right-10" />
        </div>
        <p className="plate mt-4">ALL-TIME NBA DRAFT · 1980-2026</p>
        {rings > 0 && (
          <p className="num mt-2 text-[11px] tracking-[0.2em] text-gold">
            {'●'.repeat(Math.min(rings, 12))} {rings} RING{rings > 1 ? 'S' : ''}
          </p>
        )}
      </div>

      <Sheet className="animate-rise" pad={false} title="SHEET NO. 001 · DRAFT ORDER FORM">
        <div className="cell">
          <label className="block">
            <span className="plate plate-faint mb-1 block !text-[9px]">DRAFTED BY</span>
            <input
              value={myName}
              onChange={(e) => setName(e.target.value.slice(0, 14))}
              placeholder="YOUR NAME"
              className="field headline text-xl tracking-wide"
            />
          </label>
        </div>
        {menu.map((item) => (
          <button
            key={item.n}
            type="button"
            onClick={item.go}
            className="cell group flex w-full items-baseline gap-4 text-left transition-colors hover:bg-paper2"
          >
            <span className="num text-[10px] text-faint">{item.n}</span>
            <span className="min-w-0 flex-1">
              <span className="headline block text-lg text-ink">{item.label}</span>
              <span className="mt-0.5 block text-[12px] text-dim">{item.hint}</span>
            </span>
            <span className="plate !text-[10px] text-faint transition-colors group-hover:text-hot">→</span>
          </button>
        ))}
        <JudgeCell />
      </Sheet>

      <div className="animate-rise flex items-center justify-between" style={{ animationDelay: '120ms' }}>
        <button type="button" onClick={goTrophies} className="plate cursor-pointer transition-colors hover:text-ink">
          TROPHY CASE →
        </button>
        <p className="plate plate-faint !text-[8.5px]">REAL PLAYERS · REAL STATS · PHOTOS © NBA</p>
      </div>
    </div>
  )
}

// The optional AI scout. The key is saved to localStorage in THIS browser
// only - never in the code, the bundle, or any network message to friends.
function JudgeCell() {
  const { judgeArmed, armJudge, disarmJudge } = useGame()
  const [key, setKey] = useState('')

  return (
    <div className="cell">
      {judgeArmed ? (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-hot" />
            <span className="plate !text-[9px] text-ink">AI SCOUT ARMED · CLAUDE HAIKU</span>
          </span>
          <button type="button" onClick={disarmJudge} className="plate cursor-pointer !text-[9px] transition-colors hover:text-ink">
            REMOVE KEY
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-2.5">
            <label className="min-w-0 flex-1">
              <span className="plate plate-faint mb-1 block !text-[9px]">AI SCOUT · ANTHROPIC API KEY · OPTIONAL</span>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-ant-…"
                autoComplete="off"
                className="field num w-full text-sm"
              />
            </label>
            <Btn
              disabled={!key.trim().startsWith('sk-ant')}
              onClick={() => {
                armJudge(key)
                setKey('')
              }}
              className="!px-3.5 !py-2"
            >
              ARM
            </Btn>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-faint">
            Stays in this browser only. One Haiku call per season scouts every drafted team for star power, fit, shooting and defense.
          </p>
        </>
      )}
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
      <h1 className="headline animate-rise text-center text-3xl text-ink">{solo ? 'SOLO RUN' : 'CREATE ROOM'}</h1>

      <Sheet className="animate-rise" pad={false} title="DRAFT STYLE">
        <div className="grid sm:grid-cols-2">
          <ModeCell
            active={config.mode === 'tiers'}
            n="A"
            title="TIERED SPINS"
            tag="CLASSIC"
            body="Everyone climbs the same rarity ladder. Round 1 guarantees a star. Last round is a jackpot wildcard."
            onClick={() => setConfig({ mode: 'tiers' })}
          />
          <ModeCell
            active={config.mode === 'themes'}
            n="B"
            title="THEME DRAFT"
            tag="KNOW YOUR HOOPS"
            body="Every round deals a theme - Lakers only, 40% from deep, MVPs only. Name your pick from memory, best fitting season lands."
            onClick={() => setConfig({ mode: 'themes' })}
          />
        </div>
        {config.mode === 'themes' && (
          <div className="cell flex flex-wrap items-center gap-3 border-t border-line">
            <span className="plate !text-[9px]">PICK STYLE</span>
            <Btn on={(config.input ?? 'type') === 'type'} onClick={() => setConfig({ input: 'type' })} className="!px-3.5 !py-1.5">
              TYPE-IN · HARD
            </Btn>
            <Btn on={config.input === 'grid'} onClick={() => setConfig({ input: 'grid' })} className="!px-3.5 !py-1.5">
              GRID · EASY
            </Btn>
            <span className="plate plate-faint !text-[8.5px]">
              {config.input === 'grid' ? 'CHOOSE FROM A BOARD OF FITS' : '3 STRIKES, THEN THE BOARD BAILS YOU OUT'}
            </span>
          </div>
        )}
      </Sheet>

      <Sheet className="animate-rise" pad={false} title="COMPETITION" >
        <div className="grid sm:grid-cols-2">
          <ModeCell
            active={config.format === 'season'}
            n="A"
            title="SEASON + PLAYOFFS"
            tag="THE FULL DREAM"
            body="Round-robin season, standings, seeding, then a playoff bracket to crown the champ."
            onClick={() => setConfig({ format: 'season', leagueSize: [4, 6, 8].includes(config.leagueSize) ? config.leagueSize : 4 })}
          />
          <ModeCell
            active={config.format === 'series'}
            n="B"
            title="STRAIGHT PLAYOFFS"
            tag="QUICK & DEADLY"
            body="Skip the season. Seeded by team power, best-of-7 series, win or go home."
            onClick={() => setConfig({ format: 'series', leagueSize: [2, 4, 8].includes(config.leagueSize) ? config.leagueSize : 4 })}
          />
        </div>
        <div className="cell flex flex-wrap items-center gap-3 border-t border-line">
          <span className="plate !text-[9px]">LEAGUE SIZE</span>
          {sizes.map((n) => (
            <Btn key={n} on={config.leagueSize === n} onClick={() => setConfig({ leagueSize: n })} className="!px-3.5 !py-1.5">
              {n}
            </Btn>
          ))}
          <span className="plate plate-faint !text-[8.5px]">CPU TEAMS FILL EMPTY SPOTS</span>
        </div>
        {solo && (
          <div className="cell flex flex-wrap items-center gap-3 border-t border-line">
            <span className="plate !text-[9px]">LIVE CPU DRAFTERS</span>
            {[1, 2, 3].map((n) => (
              <Btn key={n} on={cpuDrafters === n} onClick={() => setCpuDrafters(n)} className="!px-3.5 !py-1.5">
                {n}
              </Btn>
            ))}
            <span className="plate plate-faint !text-[8.5px]">THEY SPIN AND PICK LIKE YOU DO</span>
          </div>
        )}
      </Sheet>

      {netError && <p className="plate text-center !text-[10px] text-ink">{netError}</p>}

      <div className="animate-rise flex justify-center gap-3" style={{ animationDelay: '100ms' }}>
        <Btn onClick={goHome}>BACK</Btn>
        {solo ? (
          <Btn primary onClick={startSolo}>
            TIP-OFF →
          </Btn>
        ) : (
          <Btn primary onClick={createRoom} disabled={netStatus === 'connecting'}>
            {netStatus === 'connecting' ? 'OPENING…' : 'OPEN ROOM →'}
          </Btn>
        )}
      </div>
    </div>
  )
}

function ModeCell({
  active,
  n,
  title,
  tag,
  body,
  onClick,
}: {
  active: boolean
  n: string
  title: string
  tag: string
  body: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cell relative text-left transition-colors sm:border-t-0 sm:[&:nth-child(2)]:border-l sm:[&:nth-child(2)]:border-line ${
        active ? 'bg-paper2' : 'hover:bg-paper2/60'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="flex items-baseline gap-2.5">
          <span className={`num text-[10px] ${active ? 'text-hot' : 'text-faint'}`}>{n}</span>
          <span className="headline text-lg text-ink">{title}</span>
        </span>
        <span className={`plate !text-[8.5px] ${active ? 'text-ink' : ''}`}>{tag}</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-dim">{body}</p>
      {active && <span className="absolute inset-x-0 bottom-0 h-px bg-hot" />}
    </button>
  )
}

// -------------------------------------------------------------------- join

export function JoinScreen() {
  const { joinRoom, goHome, netStatus, netError } = useGame()
  const [code, setCode] = useState('')

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <h1 className="headline animate-rise text-center text-3xl text-ink">JOIN A ROOM</h1>
      <Sheet className="animate-rise">
        <label className="block text-center">
          <span className="plate mb-3 block !text-[9px]">4-LETTER ROOM CODE</span>
          <input
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            placeholder="ABCD"
            autoFocus
            className="field num w-44 !border-b-2 text-center text-4xl font-bold tracking-[0.35em] text-ink"
          />
        </label>
        {netStatus === 'connecting' && <p className="plate mt-4 animate-pulse text-center !text-[10px]">CONNECTING…</p>}
        {netError && <p className="plate mt-4 text-center !text-[10px] text-ink">{netError}</p>}
      </Sheet>
      <div className="flex justify-center gap-3">
        <Btn onClick={goHome}>BACK</Btn>
        <Btn primary onClick={() => joinRoom(code)} disabled={code.length !== 4 || netStatus === 'connecting'}>
          CONNECT →
        </Btn>
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
      <div className="animate-rise text-center">
        <p className="plate">ROOM CODE</p>
        <p className="num mt-1 text-7xl font-bold tracking-[0.22em] text-ink">{lobby.code}</p>
        <p className="mt-2 text-sm text-dim">Friends open the game and hit JOIN WITH A CODE</p>
      </div>

      <Sheet className="animate-rise" pad={false} title={`SQUAD UP · ${lobby.players.length}/8`}>
        {lobby.players.map((p, i) => (
          <div key={p.id} className="cell flex items-center justify-between !py-3">
            <span className="flex items-baseline gap-3">
              <span className="num text-[10px] text-faint">{String(i + 1).padStart(2, '0')}</span>
              <span className="headline text-lg text-ink">{p.name}</span>
              {p.id === myId && <span className="plate !text-[8.5px] text-hot">YOU</span>}
              {i === 0 && <span className="plate !text-[8.5px]">HOST</span>}
              {p.isCpu && <span className="plate !text-[8.5px]">CPU</span>}
            </span>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-hot" />
          </div>
        ))}
        {isHost && (
          <div className="cell !py-3">
            <Btn onClick={hostAddCpu} className="!px-3.5 !py-1.5">
              + ADD BOT
            </Btn>
          </div>
        )}
      </Sheet>

      <div className="flex justify-center gap-3">
        <Btn onClick={goHome}>LEAVE</Btn>
        {isHost ? (
          <Btn primary onClick={hostStart} disabled={lobby.players.length < 2}>
            START DRAFT →
          </Btn>
        ) : (
          <StatusLine text="WAITING FOR HOST…" className="!border-0" />
        )}
      </div>
    </div>
  )
}
