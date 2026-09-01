import { useMemo, useState } from 'react'
import { eligibleThemes, KIND_LABELS, KIND_ORDER, themeById } from '../game/themes'
import { ROUNDS } from '../game/draft'
import { PARTY_ROSTER_SIZE } from '../game/party'
import { useGame } from '../game/store'
import { normalizeRoomCode } from '../net/protocol'
import { Btn, RingSeal, Sheet, StatusLine } from './components'

// -------------------------------------------------------------------- home

export function HomeScreen() {
  const { myName, setName, goThemePick, goSetup, goJoin, goTrophies, trophies } = useGame()
  const rings = trophies.filter((t) => t.championWasMe).length

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
        {rings > 0 && (
          <p className="num mt-3 text-[11px] tracking-[0.2em] text-gold">
            {'●'.repeat(Math.min(rings, 12))} {rings}
          </p>
        )}
      </div>

      <Sheet className="animate-rise" pad={false}>
        <div className="cell !py-3">
          <input
            value={myName}
            onChange={(e) => setName(e.target.value.slice(0, 14))}
            placeholder="YOUR NAME"
            className="field headline text-xl tracking-wide"
          />
        </div>
        <button
          type="button"
          onClick={goThemePick}
          className="cell group flex w-full items-center gap-4 text-left transition-colors hover:bg-paper2"
        >
          <span className="min-w-0 flex-1">
            <span className="headline block text-2xl text-ink">CHASE 82-0</span>
            <span className="mt-0.5 block text-[12px] text-dim">Pick a theme. Draft 8 by name. Survive 82 games.</span>
          </span>
          <span className="num text-lg text-faint transition-colors group-hover:text-hot">→</span>
        </button>
        <button
          type="button"
          onClick={() => goSetup('host')}
          className="cell group flex w-full items-center gap-4 text-left transition-colors hover:bg-paper2"
        >
          <span className="min-w-0 flex-1">
            <span className="headline block text-2xl text-ink">FRIENDS</span>
            <span className="mt-0.5 block text-[12px] text-dim">Host a room, share a 4 letter code.</span>
          </span>
          <span className="num text-lg text-faint transition-colors group-hover:text-hot">→</span>
        </button>
        <button
          type="button"
          onClick={goJoin}
          className="cell group flex w-full items-center gap-4 text-left transition-colors hover:bg-paper2"
        >
          <span className="min-w-0 flex-1">
            <span className="headline block text-2xl text-ink">JOIN</span>
            <span className="mt-0.5 block text-[12px] text-dim">Got a code? Hop in.</span>
          </span>
          <span className="num text-lg text-faint transition-colors group-hover:text-hot">→</span>
        </button>
      </Sheet>

      <div className="animate-rise flex items-center justify-between" style={{ animationDelay: '120ms' }}>
        <button type="button" onClick={goTrophies} className="plate cursor-pointer transition-colors hover:text-ink">
          RINGS →
        </button>
        <p className="plate plate-faint !text-[8.5px]">REAL PLAYERS · PHOTOS © NBA</p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ theme picker

// Every theme deep enough for this league, grouped the way the registry
// thinks: teams, eras, stat lines, measurables, career paths, hardware,
// the lists. Tap one to lock it in.
export function ThemeMenu({
  playerCount,
  selected,
  onPick,
  rounds = ROUNDS,
}: {
  playerCount: number
  selected: string | null
  onPick: (id: string) => void
  rounds?: number
}) {
  const pool = useGame((s) => s.pool)
  const themes = useMemo(() => (pool ? eligibleThemes(pool, playerCount, rounds) : []), [pool, playerCount, rounds])

  if (!pool) return <p className="plate animate-pulse py-8 text-center !text-[10px]">DEALING THE POOL…</p>

  return (
    <div className="grid gap-4">
      {KIND_ORDER.map((kind) => {
        const group = themes.filter((t) => t.kind === kind)
        if (group.length === 0) return null
        return (
          <div key={kind}>
            <p className="plate plate-faint mb-1.5 !text-[9px]">{KIND_LABELS[kind]}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.map((theme) => (
                <Btn
                  key={theme.id}
                  on={selected === theme.id}
                  onClick={() => onPick(theme.id)}
                  className="!px-2.5 !py-1.5 !text-[10px]"
                >
                  {theme.label}
                </Btn>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// The chase's front door: smash RANDOM or browse for your poison, then
// the draft starts immediately.
export function ThemePickScreen() {
  const { startSolo, goHome } = useGame()

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="headline animate-rise text-center text-3xl text-ink">PICK YOUR POISON</h1>

      <button
        type="button"
        onClick={() => void startSolo(null)}
        className="sheet animate-rise group flex w-full items-center gap-4 px-[18px] py-4 text-left transition-colors hover:bg-paper2"
      >
        <span className="min-w-0 flex-1">
          <span className="headline block text-2xl text-ink">RANDOM</span>
          <span className="mt-0.5 block text-[12px] text-dim">Let the sheet deal. Face whatever comes.</span>
        </span>
        <span className="num text-lg text-faint transition-colors group-hover:text-hot">→</span>
      </button>

      <Sheet className="animate-rise" title="OR CHOOSE THE QUESTION">
        <ThemeMenu playerCount={1} selected={null} onPick={(id) => void startSolo(id)} />
      </Sheet>

      <div className="flex justify-center">
        <Btn onClick={goHome}>BACK</Btn>
      </div>
    </div>
  )
}

// ------------------------------------------------------- hidden scout page
//
// Reached only via the #scout hash - never linked from the game. Arms the
// AI scout in THIS browser by storing a personal Anthropic key in
// localStorage (never in code, the bundle, or any message to friends).
// With the judge proxy deployed this page becomes unnecessary.
export function ScoutScreen() {
  const { judgeArmed, armJudge, disarmJudge, goHome } = useGame()
  const [key, setKey] = useState('')

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <h1 className="headline animate-rise text-center text-3xl text-ink">SCOUT</h1>
      <Sheet className="animate-rise">
        {judgeArmed ? (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-hot" />
              <span className="plate !text-[9px] text-ink">ARMED IN THIS BROWSER</span>
            </span>
            <Btn onClick={disarmJudge} className="!px-3 !py-1.5">
              REMOVE
            </Btn>
          </div>
        ) : (
          <div className="flex items-end gap-2.5">
            <label className="min-w-0 flex-1">
              <span className="plate plate-faint mb-1 block !text-[9px]">ANTHROPIC API KEY</span>
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
        )}
        <p className="mt-2 text-[11px] leading-snug text-faint">
          Stays in this browser's localStorage only. Rooms you host share the scout with everyone in them.
        </p>
      </Sheet>
      <div className="flex justify-center">
        <Btn
          onClick={() => {
            window.location.hash = ''
            goHome()
          }}
        >
          BACK
        </Btn>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- setup

const DRAFT_MODES: { mode: 'themes' | 'budget' | 'auction'; label: string; hint: string }[] = [
  { mode: 'themes', label: 'THEME TYPING', hint: 'Name your 8 from memory.' },
  { mode: 'budget', label: 'DOLLAR TABLE', hint: '$15, five shelves, build your five.' },
  { mode: 'auction', label: 'AUCTION', hint: '$50, live bidding, the hammer decides.' },
]

export function SetupScreen() {
  const { config, setConfig, createRoom, goHome, netStatus, netError } = useGame()
  const sizes = config.format === 'series' ? [2, 4, 8] : [4, 6, 8]
  const [browsing, setBrowsing] = useState(false)
  const chosenTheme = config.theme ?? null
  const party = config.mode !== 'themes'

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 px-4 py-10">
      <h1 className="headline animate-rise text-center text-3xl text-ink">FRIENDS</h1>

      <Sheet className="animate-rise" pad={false}>
        <div className="grid sm:grid-cols-2">
          <ModeCell
            active={config.format === 'season'}
            title="SEASON"
            body="Round robin, standings, playoffs, ring."
            onClick={() => setConfig({ format: 'season', leagueSize: [4, 6, 8].includes(config.leagueSize) ? config.leagueSize : 4 })}
          />
          <ModeCell
            active={config.format === 'series'}
            title="PLAYOFFS"
            body="Straight best-of-7. Win or go home."
            onClick={() => setConfig({ format: 'series', leagueSize: [2, 4, 8].includes(config.leagueSize) ? config.leagueSize : 4 })}
          />
        </div>
        <div className="cell border-t border-line">
          <div className="flex flex-wrap items-center gap-3">
            <span className="plate !text-[9px]">DRAFT</span>
            {DRAFT_MODES.map((m) => (
              <Btn key={m.mode} on={config.mode === m.mode} onClick={() => setConfig({ mode: m.mode })} className="!px-3.5 !py-1.5">
                {m.label}
              </Btn>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">{DRAFT_MODES.find((m) => m.mode === config.mode)?.hint}</p>
        </div>
        {!party && (
          <div className="cell flex flex-wrap items-center gap-3 border-t border-line">
            <span className="plate !text-[9px]">TEAMS</span>
            {sizes.map((n) => (
              <Btn key={n} on={config.leagueSize === n} onClick={() => setConfig({ leagueSize: n })} className="!px-3.5 !py-1.5">
                {n}
              </Btn>
            ))}
          </div>
        )}
        {party && (
          <div className="cell border-t border-line">
            <p className="plate plate-faint !text-[8.5px]">EVERY SEAT IN THE ROOM IS A TEAM · 5-MAN SQUADS · NO FILLERS</p>
          </div>
        )}
        <div className="cell border-t border-line">
          <div className="flex flex-wrap items-center gap-3">
            <span className="plate !text-[9px]">THEME</span>
            <Btn on={chosenTheme === null} onClick={() => setConfig({ theme: null })} className="!px-3.5 !py-1.5">
              RANDOM
            </Btn>
            <Btn on={chosenTheme !== null} onClick={() => setBrowsing((b) => !b)} className="!px-3.5 !py-1.5">
              {chosenTheme !== null ? themeById(chosenTheme).label : 'CHOOSE…'}
            </Btn>
          </div>
          {browsing && (
            <div className="mt-3 border-t border-line pt-3">
              <ThemeMenu
                playerCount={party ? 8 : config.leagueSize}
                rounds={party ? PARTY_ROSTER_SIZE : ROUNDS}
                selected={chosenTheme}
                onPick={(id) => {
                  setConfig({ theme: id })
                  setBrowsing(false)
                }}
              />
            </div>
          )}
        </div>
      </Sheet>

      {netError && <p className="plate text-center !text-[10px] text-ink">{netError}</p>}

      <div className="animate-rise flex justify-center gap-3" style={{ animationDelay: '100ms' }}>
        <Btn onClick={goHome}>BACK</Btn>
        <Btn primary onClick={createRoom} disabled={netStatus === 'connecting'}>
          {netStatus === 'connecting' ? 'OPENING…' : 'OPEN ROOM →'}
        </Btn>
      </div>
    </div>
  )
}

function ModeCell({ active, title, body, onClick }: { active: boolean; title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cell relative text-left transition-colors sm:border-t-0 sm:[&:nth-child(2)]:border-l sm:[&:nth-child(2)]:border-line ${
        active ? 'bg-paper2' : 'hover:bg-paper2/60'
      }`}
    >
      <span className="headline text-xl text-ink">{title}</span>
      <p className="mt-1 text-[13px] leading-snug text-dim">{body}</p>
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
      <h1 className="headline animate-rise text-center text-3xl text-ink">JOIN</h1>
      <Sheet className="animate-rise">
        <label className="block text-center">
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
          GO →
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
        <p className="num text-7xl font-bold tracking-[0.22em] text-ink">{lobby.code}</p>
        <p className="mt-2 text-sm text-dim">Friends hit JOIN with this code</p>
      </div>

      <Sheet className="animate-rise" pad={false}>
        {lobby.players.map((p, i) => (
          <div key={p.id} className="cell flex items-center justify-between !py-3">
            <span className="flex items-baseline gap-3">
              <span className="num text-[10px] text-faint">{String(i + 1).padStart(2, '0')}</span>
              <span className="headline text-lg text-ink">{p.name}</span>
              {p.id === myId && <span className="plate !text-[8.5px] text-hot">YOU</span>}
              {p.isCpu && <span className="plate !text-[8.5px]">CPU</span>}
            </span>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-hot" />
          </div>
        ))}
        {isHost && (
          <div className="cell !py-3">
            <Btn onClick={hostAddCpu} className="!px-3.5 !py-1.5">
              + BOT
            </Btn>
          </div>
        )}
      </Sheet>

      <div className="flex justify-center gap-3">
        <Btn onClick={goHome}>LEAVE</Btn>
        {isHost ? (
          <Btn primary onClick={hostStart} disabled={lobby.players.length < 2}>
            DRAFT →
          </Btn>
        ) : (
          <StatusLine text="WAITING FOR HOST…" className="!border-0" />
        )}
      </div>
    </div>
  )
}
