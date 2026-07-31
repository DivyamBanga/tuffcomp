import { sortStandings } from '../engine/season'
import type { GameResult } from '../engine/sim'
import { useGame } from '../game/store'
import { entryName, type MatchState, type PlayoffMatchup } from '../game/match'
import { Btn, NumTick, PenStrokes, RingSeal, Sheet, StatusLine, TeamMark } from './components'

// ------------------------------------------------------------- scoreboard

function ScoreboardPanel({ match, result }: { match: MatchState; result: GameResult }) {
  const overtime = result.overtimes > 0 ? ` · ${result.overtimes}OT` : ''
  const sides = [result.away, result.home] as const
  const labels = ['AWAY', 'HOME'] as const
  return (
    <Sheet title={`LATEST GAME${overtime}`}>
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

// ----------------------------------------------------------------- season

export function SeasonScreen({ match }: { match: MatchState }) {
  const { dispatch, sessionMode, simAllRemaining, autoSimming } = useGame()
  const season = match.season!
  const canControl = sessionMode !== 'guest'
  const table = sortStandings(season.standings)
  const nextGame = season.schedule[season.played.length] ?? null
  const latest = season.played.at(-1) ?? null
  const gamesLeft = season.schedule.length - season.played.length

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-3 py-5">
      <StatusLine
        text={`REGULAR SEASON · ${gamesLeft} GAMES REMAIN · ${
          nextGame ? `NEXT: ${entryName(match, nextGame.awayId)} AT ${entryName(match, nextGame.homeId)}` : 'SEASON COMPLETE'
        }`}
      />

      <div className="grid gap-4 md:grid-cols-[290px_1fr]">
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

        <div className="flex flex-col gap-4">
          {latest ? (
            <ScoreboardPanel match={match} result={latest} />
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

export function PlayoffsScreen({ match }: { match: MatchState }) {
  const { dispatch, sessionMode, simAllRemaining, autoSimming } = useGame()
  const canControl = sessionMode !== 'guest'
  const activeRound = match.playoffRounds.at(-1)!
  const activeMatchup = activeRound.matchups.find((m) => m.winnerId === null)
  const latest = activeMatchup?.games.at(-1) ?? activeRound.matchups.flatMap((m) => m.games).at(-1) ?? null

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
        </div>

        <div className="flex flex-col gap-4">
          {latest ? (
            <ScoreboardPanel match={match} result={latest} />
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

export function ChampionScreen({ match }: { match: MatchState }) {
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
