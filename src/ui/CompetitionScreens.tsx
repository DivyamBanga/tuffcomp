import { useEffect, useRef, useState } from 'react'
import { sortStandings } from '../engine/season'
import type { GameResult } from '../engine/sim'
import { useGame } from '../game/store'
import { entryName, type MatchState, type PlayoffMatchup } from '../game/match'
import { Btn, NumTick, PenStrokes, RingSeal, Sheet, StatusLine, TeamMark } from './components'

// ------------------------------------------------------------- scoreboard

function ScoreboardPanel({ match, result, title }: { match: MatchState; result: GameResult; title: string }) {
  const overtime = result.overtimes > 0 ? ` · ${result.overtimes}OT` : ''
  const sides = [result.away, result.home] as const
  const labels = ['AWAY', 'HOME'] as const
  return (
    <Sheet title={`${title}${overtime}`}>
      <div className="grid gap-px">
        {sides.map((side, idx) => {
          const won = result.winnerId === side.teamId
          return (
            <div key={side.teamId} className={`flex items-center gap-3 border px-3 py-2.5 ${won ? 'border-line bg-paper2' : 'border-transparent'}`}>
              <TeamMark name={entryName(match, side.teamId)} />
              <span className="min-w-0 flex-1">
                <span className={`headline block truncate text-base ${won ? 'text-ink' : 'text-dim'}`}>
                  {entryName(match, side.teamId)}
                </span>
                <span className="plate plate-faint !text-[8.5px]">{labels[idx]}</span>
              </span>
              <span className="num hidden gap-2.5 text-[11px] text-faint sm:flex">
                {side.quarters.map((q, i) => (
                  <span key={i} className="w-6 text-center">
                    {q}
                  </span>
                ))}
              </span>
              <NumTick value={side.score} />
            </div>
          )
        })}
      </div>
      <p className="plate mt-3 text-center !text-[9px]">
        ★ STAR OF THE GAME: {result.star.name.toUpperCase()} · {result.star.line}
      </p>
      <BoxScore match={match} result={result} />
    </Sheet>
  )
}

function BoxScore({ match, result }: { match: MatchState; result: GameResult }) {
  return (
    <details className="mt-3">
      <summary className="plate cursor-pointer list-none text-center !text-[9px] transition-colors hover:text-ink">
        FULL BOX SCORE ▾
      </summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {[result.away, result.home].map((side) => (
          <div key={side.teamId} className="border border-line p-2.5">
            <p className="headline mb-1.5 text-sm text-ink">{entryName(match, side.teamId)}</p>
            <table className="ledger">
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>PTS</th>
                  <th>REB</th>
                  <th>AST</th>
                </tr>
              </thead>
              <tbody>
                {[...side.box]
                  .sort((a, b) => b.pts - a.pts)
                  .map((line) => (
                    <tr key={line.cardId}>
                      <td className="max-w-28 truncate">{line.name.split(' ').at(-1)}</td>
                      <td>{line.pts}</td>
                      <td>{line.reb}</td>
                      <td>{line.ast}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </details>
  )
}

// --------------------------------------------------------------- game log

interface LoggedGame {
  label: string
  result: GameResult
}

// The ledger: every played game, newest at the bottom, tap a row to pull
// its full box score up into the scoreboard.
function GameLog({
  match,
  games,
  selected,
  onSelect,
}: {
  match: MatchState
  games: LoggedGame[]
  selected: number
  onSelect: (index: number) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const followTail = selected === games.length - 1

  useEffect(() => {
    if (followTail && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [games.length, followTail])

  return (
    <Sheet title={`GAME LOG · ${games.length}`} pad={false}>
      <div ref={scroller} className="max-h-72 overflow-y-auto">
        {games.length === 0 && <p className="plate plate-faint px-4 py-6 text-center !text-[9px]">NOTHING IN THE BOOKS YET</p>}
        {games.map((game, i) => {
          const { result } = game
          const awayWon = result.winnerId === result.away.teamId
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className={`num flex w-full items-center gap-2 border-t border-line px-3 py-1.5 text-left text-[10.5px] transition-colors first:border-t-0 ${
                i === selected ? 'bg-paper2 text-ink' : 'text-dim hover:bg-paper2/60'
              }`}
            >
              <span className="w-9 shrink-0 text-[9px] text-faint">{game.label}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className={awayWon ? 'font-bold text-ink' : ''}>{entryName(match, result.away.teamId)}</span>
                <span className="text-faint"> @ </span>
                <span className={awayWon ? '' : 'font-bold text-ink'}>{entryName(match, result.home.teamId)}</span>
              </span>
              <span className="shrink-0">
                {result.away.score}-{result.home.score}
              </span>
              <span className="w-16 shrink-0 truncate text-right text-[9px] text-faint">
                ★{result.star.name.split(' ').at(-1)} {result.star.line.split(' ')[0]}
              </span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

// Follow the newest game as sims land, but let the user browse history.
function useGameSelection(count: number): [number, (i: number) => void] {
  const [selected, setSelected] = useState(count - 1)
  const lastCount = useRef(count)
  useEffect(() => {
    if (count !== lastCount.current) {
      lastCount.current = count
      setSelected(count - 1)
    }
  }, [count])
  return [selected, setSelected]
}

// ------------------------------------------------------------------ chase

// The 82-0 run: one big record, one button, every loss stings.
function ChaseScreen({ match }: { match: MatchState }) {
  const { dispatch, simAllRemaining, autoSimming } = useGame()
  const season = match.season!
  const me = match.entries.find((e) => !e.isFiller)!
  const myRow = season.standings.find((r) => r.teamId === me.id)!
  const played = season.played.length
  const total = season.schedule.length

  const logged: LoggedGame[] = season.played.map((result, i) => ({ label: `G${i + 1}`, result }))
  const [selected, setSelected] = useGameSelection(logged.length)
  const shown = logged[selected] ?? null

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 px-3 py-5">
      <div className="animate-rise text-center">
        <p className="num text-7xl font-bold text-ink sm:text-8xl">
          {myRow.wins}
          <span className="text-faint">-</span>
          <span className={myRow.losses > 0 ? 'text-dim' : 'gold'}>{myRow.losses}</span>
        </p>
        <div className="mx-auto mt-3 h-[3px] w-64 border border-line">
          <div
            className={`h-full transition-all duration-200 ${myRow.losses === 0 ? 'bg-gold' : 'bg-ink'}`}
            style={{ width: `${(played / total) * 100}%` }}
          />
        </div>
        <p className="num mt-1.5 text-[10px] text-faint">
          {played}/{total}
        </p>
      </div>

      <div className="flex justify-center gap-3">
        <Btn primary onClick={simAllRemaining}>
          {autoSimming ? '■ STOP' : '▶ RUN'}
        </Btn>
        <Btn onClick={() => dispatch({ type: 'SIM_NEXT' })} disabled={autoSimming}>
          +1
        </Btn>
      </div>

      {shown && <ScoreboardPanel match={match} result={shown.result} title={`GAME ${selected + 1}`} />}
      <GameLog match={match} games={logged} selected={selected} onSelect={setSelected} />
    </div>
  )
}

// ----------------------------------------------------------------- season

export function SeasonScreen({ match }: { match: MatchState }) {
  if (match.config.format === 'chase') return <ChaseScreen match={match} />
  return <LeagueSeasonScreen match={match} />
}

function LeagueSeasonScreen({ match }: { match: MatchState }) {
  const { dispatch, sessionMode, simAllRemaining, autoSimming } = useGame()
  const season = match.season!
  const canControl = sessionMode !== 'guest'
  const table = sortStandings(season.standings)
  const nextGame = season.schedule[season.played.length] ?? null
  const gamesLeft = season.schedule.length - season.played.length

  const logged: LoggedGame[] = season.played.map((result, i) => ({ label: `G${i + 1}`, result }))
  const [selected, setSelected] = useGameSelection(logged.length)
  const shown = logged[selected] ?? null

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-3 py-5">
      <StatusLine
        text={`REGULAR SEASON · ${gamesLeft} GAMES REMAIN · ${
          nextGame ? `NEXT: ${entryName(match, nextGame.awayId)} AT ${entryName(match, nextGame.homeId)}` : 'SEASON COMPLETE'
        }`}
      />

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4">
        <Sheet title="STANDINGS">
          <table className="ledger">
            <thead>
              <tr>
                <th>TEAM</th>
                <th>W</th>
                <th>L</th>
                <th>STRK</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr key={row.teamId}>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="num w-4 text-[10px] text-faint">{i + 1}</span>
                      <TeamMark name={entryName(match, row.teamId)} size={20} />
                      <span className="max-w-28 truncate font-sans text-[12.5px] font-semibold text-ink">
                        {entryName(match, row.teamId)}
                      </span>
                    </span>
                  </td>
                  <td className="font-bold">{row.wins}</td>
                  <td className="text-dim">{row.losses}</td>
                  <td className={row.streak >= 3 ? 'text-ink' : 'text-faint'}>
                    {row.streak > 0 ? `W${row.streak}` : row.streak < 0 ? `L${-row.streak}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
        <GameLog match={match} games={logged} selected={selected} onSelect={setSelected} />
        </div>

        <div className="flex flex-col gap-4">
          {shown ? (
            <ScoreboardPanel match={match} result={shown.result} title={`GAME ${selected + 1} OF ${season.schedule.length}`} />
          ) : (
            <Sheet>
              <p className="plate py-10 text-center !text-[10px]">THE SEASON AWAITS…</p>
            </Sheet>
          )}
          {canControl && (
            <div className="flex flex-wrap justify-center gap-3">
              <Btn primary onClick={() => dispatch({ type: 'SIM_NEXT' })} disabled={autoSimming}>
                SIM NEXT GAME
              </Btn>
              <Btn onClick={simAllRemaining}>{autoSimming ? '■ STOP' : '▶▶ SIM THE REST'}</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- playoffs

function SeriesCard({ match, matchup }: { match: MatchState; matchup: PlayoffMatchup }) {
  const teams = [matchup.higherId, matchup.lowerId]
  return (
    <div className={`border p-3 ${matchup.winnerId ? 'border-line bg-paper2' : 'border-line'}`}>
      {teams.map((id) => {
        const wins = matchup.tally[id]
        const isWinner = matchup.winnerId === id
        return (
          <div key={id} className="flex items-center gap-2 py-1">
            <TeamMark name={entryName(match, id)} size={22} />
            <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${isWinner ? 'text-ink' : 'text-dim'}`}>
              {entryName(match, id)}
            </span>
            <span className="flex gap-1">
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} className={`h-1.5 w-1.5 ${i < wins ? 'bg-hot' : 'border border-line'}`} />
              ))}
            </span>
          </div>
        )
      })}
      {matchup.winnerId && (
        <p className="plate plate-faint mt-1 text-center !text-[8.5px]">
          SERIES {matchup.tally[matchup.winnerId]}-{matchup.tally[matchup.winnerId === matchup.higherId ? matchup.lowerId : matchup.higherId]}
        </p>
      )}
    </div>
  )
}

const ROUND_ABBREV: Record<string, string> = { 'THE FINALS': 'F', SEMIFINALS: 'SF', QUARTERFINALS: 'QF' }

export function PlayoffsScreen({ match }: { match: MatchState }) {
  const { dispatch, sessionMode, simAllRemaining, autoSimming } = useGame()
  const canControl = sessionMode !== 'guest'
  const activeRound = match.playoffRounds.at(-1)!
  const activeMatchup = activeRound.matchups.find((m) => m.winnerId === null)

  const logged: LoggedGame[] = match.playoffRounds.flatMap((round) =>
    round.matchups.flatMap((m) =>
      m.games.map((result, g) => ({ label: `${ROUND_ABBREV[round.name] ?? 'R'} G${g + 1}`, result })),
    ),
  )
  const [selected, setSelected] = useGameSelection(logged.length)
  const shown = logged[selected] ?? null

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-3 py-5">
      <StatusLine
        text={`${activeRound.name} · ${
          activeMatchup
            ? `${entryName(match, activeMatchup.higherId)} VS ${entryName(match, activeMatchup.lowerId)} · GAME ${activeMatchup.games.length + 1}`
            : 'ROUND COMPLETE'
        }`}
      />

      <div className="grid gap-4 md:grid-cols-[270px_1fr]">
        <div className="flex flex-col gap-3">
          {match.playoffRounds.map((round) => (
            <Sheet key={round.name} title={round.name}>
              <div className="grid gap-2">
                {round.matchups.map((m, i) => (
                  <SeriesCard key={i} match={match} matchup={m} />
                ))}
              </div>
            </Sheet>
          ))}
          <GameLog match={match} games={logged} selected={selected} onSelect={setSelected} />
        </div>

        <div className="flex flex-col gap-4">
          {shown ? (
            <ScoreboardPanel match={match} result={shown.result} title={shown.label === logged.at(-1)?.label && selected === logged.length - 1 ? `LATEST · ${shown.label}` : shown.label} />
          ) : (
            <Sheet>
              <p className="plate py-10 text-center !text-[10px]">THE BRACKET IS SET…</p>
            </Sheet>
          )}
          {canControl && (
            <div className="flex flex-wrap justify-center gap-3">
              <Btn primary onClick={() => dispatch({ type: 'SIM_NEXT' })} disabled={autoSimming}>
                SIM NEXT GAME
              </Btn>
              <Btn onClick={simAllRemaining}>{autoSimming ? '■ STOP' : '▶▶ SIM THE REST'}</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- champion

// The end of a chase run: perfection takes the ring, anything else posts
// the record and dares you to run it back.
function ChaseEndScreen({ match }: { match: MatchState }) {
  const { goHome, startSolo } = useGame()
  const me = match.entries.find((e) => !e.isFiller)!
  const myRow = match.season!.standings.find((r) => r.teamId === me.id)!
  const perfect = myRow.losses === 0

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-6 overflow-hidden px-4 py-10 text-center">
      {perfect && <PenStrokes />}
      {perfect && (
        <div className="animate-rise relative">
          <RingSeal size={168} strokeWidth={7} />
          <span className="num absolute inset-0 flex items-center justify-center text-4xl">🏆</span>
        </div>
      )}
      <p className={`num animate-rise text-8xl font-bold ${perfect ? 'gold' : 'text-ink'}`} style={{ animationDelay: '120ms' }}>
        {myRow.wins}-{myRow.losses}
      </p>
      {perfect && <p className="headline animate-rise text-3xl text-ink">PERFECT SEASON</p>}
      {match.seasonMvp && (
        <p className="plate animate-rise !text-[9.5px]" style={{ animationDelay: '250ms' }}>
          {match.seasonMvp.name.toUpperCase()} · {match.seasonMvp.statLine}
        </p>
      )}
      <div className="animate-rise flex gap-3" style={{ animationDelay: '350ms' }}>
        <Btn primary onClick={() => void startSolo(match.config.input ?? 'type')}>
          RUN IT BACK →
        </Btn>
        <Btn onClick={goHome}>HOME</Btn>
      </div>
    </div>
  )
}

export function ChampionScreen({ match }: { match: MatchState }) {
  if (match.config.format === 'chase') return <ChaseEndScreen match={match} />
  return <LeagueChampionScreen match={match} />
}

function LeagueChampionScreen({ match }: { match: MatchState }) {
  const { myId, goHome } = useGame()
  const champion = match.entries.find((e) => e.id === match.championId)
  const itsMe = match.championId === myId

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-7 overflow-hidden px-4 py-10 text-center">
      <PenStrokes />

      <p className="plate animate-rise">AND YOUR CHAMPION IS</p>

      <div className="animate-rise relative" style={{ animationDelay: '150ms' }}>
        <RingSeal size={168} strokeWidth={7} />
        <span className="num absolute inset-0 flex items-center justify-center text-4xl">🏆</span>
      </div>

      <h1 className="headline animate-rise text-6xl leading-none text-ink sm:text-7xl" style={{ animationDelay: '350ms' }}>
        {champion?.name}
      </h1>
      {itsMe && (
        <p className="plate animate-rise !text-[11px] !tracking-[0.3em] text-gold" style={{ animationDelay: '500ms' }}>
          YOU GOT THE RING
        </p>
      )}

      <div className="animate-rise grid w-full gap-1.5" style={{ animationDelay: '600ms' }}>
        {match.finalsMvp && (
          <p className="plate !text-[9.5px]">
            FINALS MVP: {match.finalsMvp.name.toUpperCase()} · {match.finalsMvp.statLine}
          </p>
        )}
        {match.seasonMvp && (
          <p className="plate plate-faint !text-[9.5px]">
            SEASON MVP: {match.seasonMvp.name.toUpperCase()} · {match.seasonMvp.statLine}
          </p>
        )}
      </div>

      <Btn primary onClick={goHome} className="animate-rise" >
        RUN IT BACK →
      </Btn>
    </div>
  )
}

// ----------------------------------------------------------------- trophies

export function TrophiesScreen() {
  const { trophies, goHome } = useGame()
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-5 px-4 py-10">
      <h1 className="headline animate-rise text-center text-3xl text-ink">TROPHY CASE</h1>
      <Sheet className="animate-rise" pad={false} title={`RINGS ON RECORD · ${trophies.length}`}>
        {trophies.length === 0 ? (
          <p className="plate cell py-8 text-center !text-[10px]">NO RINGS YET. GO CHASE ONE.</p>
        ) : (
          trophies.map((t) => (
            <div key={t.id} className="cell flex items-center justify-between !py-3">
              <span>
                <span className={`headline block text-base ${t.championWasMe ? 'gold' : 'text-ink'}`}>
                  {t.championName}
                </span>
                <span className="plate plate-faint !text-[8.5px]">
                  {new Date(t.wonAt).toLocaleDateString()} · {t.format.toUpperCase()} · {t.leagueSize} TEAMS
                  {t.finalsMvpName ? ` · FMVP ${t.finalsMvpName.toUpperCase()}` : ''}
                </span>
              </span>
              <span className={`num text-lg ${t.championWasMe ? 'gold' : 'text-faint'}`}>●</span>
            </div>
          ))
        )}
      </Sheet>
      <div className="flex justify-center">
        <Btn onClick={goHome}>BACK</Btn>
      </div>
    </div>
  )
}
