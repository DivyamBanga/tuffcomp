import { sortStandings } from '../engine/season'
import type { GameResult } from '../engine/sim'
import { useGame } from '../game/store'
import { entryName, type MatchState, type PlayoffMatchup } from '../game/match'
import { JumboPanel, LedScore, LedTicker, NeonButton, TeamBadge } from './components'

function entryIndex(match: MatchState, id: string): number {
  return Math.max(0, match.entries.findIndex((e) => e.id === id))
}

// ------------------------------------------------------------- scoreboard

function ScoreboardPanel({ match, result }: { match: MatchState; result: GameResult }) {
  const overtime = result.overtimes > 0 ? ` · ${result.overtimes}OT` : ''
  const sides = [result.away, result.home] as const
  const labels = ['AWAY', 'HOME'] as const
  return (
    <JumboPanel title={`LATEST GAME${overtime}`}>
      <div className="grid gap-2">
        {sides.map((side, idx) => {
          const won = result.winnerId === side.teamId
          return (
            <div key={side.teamId} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${won ? 'bg-neon/10' : 'bg-panel-deep'}`}>
              <TeamBadge name={entryName(match, side.teamId)} index={entryIndex(match, side.teamId)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-lg tracking-wide text-chalk">
                  {entryName(match, side.teamId)}
                </span>
                <span className="font-led text-[9px] tracking-widest text-mist">{labels[idx]}</span>
              </span>
              <span className="flex gap-2.5 font-led text-xs text-mist">
                {side.quarters.map((q, i) => (
                  <span key={i} className="w-6 text-center">
                    {q}
                  </span>
                ))}
              </span>
              <LedScore value={side.score} accent={won} />
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-center font-led text-[10px] tracking-[0.25em] text-ice">
        ⭐ STAR OF THE GAME: {result.star.name.toUpperCase()} · {result.star.line}
      </p>
      <BoxScore match={match} result={result} />
    </JumboPanel>
  )
}

function BoxScore({ match, result }: { match: MatchState; result: GameResult }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-center font-led text-[10px] tracking-[0.3em] text-mist hover:text-chalk">
        FULL BOX SCORE
      </summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {[result.away, result.home].map((side) => (
          <div key={side.teamId} className="rounded-lg border border-bezel bg-panel-deep p-2">
            <p className="mb-1 font-display text-sm tracking-wide text-chalk">{entryName(match, side.teamId)}</p>
            <table className="w-full font-led text-[10px] text-chalk/80">
              <thead>
                <tr className="text-mist">
                  <th className="text-left font-normal">PLAYER</th>
                  <th className="text-right font-normal">P</th>
                  <th className="text-right font-normal">R</th>
                  <th className="text-right font-normal">A</th>
                </tr>
              </thead>
              <tbody>
                {[...side.box]
                  .sort((a, b) => b.pts - a.pts)
                  .map((line) => (
                    <tr key={line.cardId}>
                      <td className="max-w-28 truncate text-left">{line.name.split(' ').at(-1)}</td>
                      <td className="text-right">{line.pts}</td>
                      <td className="text-right">{line.reb}</td>
                      <td className="text-right">{line.ast}</td>
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
      <LedTicker
        text={`REGULAR SEASON · ${gamesLeft} GAMES REMAIN · ${
          nextGame ? `NEXT: ${entryName(match, nextGame.awayId)} AT ${entryName(match, nextGame.homeId)}` : 'SEASON COMPLETE'
        }`}
      />

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <JumboPanel title="STANDINGS">
          <table className="w-full">
            <thead>
              <tr className="font-led text-[9px] tracking-widest text-mist">
                <th className="pb-1 text-left font-normal">TEAM</th>
                <th className="pb-1 text-right font-normal">W</th>
                <th className="pb-1 text-right font-normal">L</th>
                <th className="pb-1 text-right font-normal">STRK</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr key={row.teamId} className="border-t border-bezel/60">
                  <td className="flex items-center gap-2 py-1.5">
                    <span className="w-4 font-led text-[10px] text-mist">{i + 1}</span>
                    <TeamBadge name={entryName(match, row.teamId)} index={entryIndex(match, row.teamId)} size={22} />
                    <span className="max-w-28 truncate text-sm font-semibold">{entryName(match, row.teamId)}</span>
                  </td>
                  <td className="text-right font-led text-sm font-bold text-chalk">{row.wins}</td>
                  <td className="text-right font-led text-sm text-mist">{row.losses}</td>
                  <td className={`text-right font-led text-[10px] ${row.streak >= 3 ? 'text-ember' : 'text-mist'}`}>
                    {row.streak > 0 ? `W${row.streak}${row.streak >= 3 ? ' 🔥' : ''}` : row.streak < 0 ? `L${-row.streak}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </JumboPanel>

        <div className="flex flex-col gap-4">
          {latest ? (
            <ScoreboardPanel match={match} result={latest} />
          ) : (
            <JumboPanel>
              <p className="py-10 text-center font-led text-sm tracking-[0.3em] text-mist">THE SEASON AWAITS…</p>
            </JumboPanel>
          )}
          {canControl && (
            <div className="flex flex-wrap justify-center gap-3">
              <NeonButton onClick={() => dispatch({ type: 'SIM_NEXT' })} disabled={autoSimming}>
                SIM NEXT GAME
              </NeonButton>
              <NeonButton color="ember" onClick={simAllRemaining}>
                {autoSimming ? '■ STOP' : '▶▶ SIM THE REST'}
              </NeonButton>
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
    <div className={`rounded-xl border p-3 ${matchup.winnerId ? 'border-gold/50 bg-gold/5' : 'border-bezel bg-panel-deep'}`}>
      {teams.map((id) => {
        const wins = matchup.tally[id]
        const isWinner = matchup.winnerId === id
        return (
          <div key={id} className="flex items-center gap-2 py-1">
            <TeamBadge name={entryName(match, id)} index={entryIndex(match, id)} size={24} />
            <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${isWinner ? 'text-gold' : ''}`}>
              {entryName(match, id)}
            </span>
            <span className="flex gap-1">
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i < wins ? 'bg-neon shadow-[0_0_6px_rgba(255,179,0,0.8)]' : 'bg-bezel'}`} />
              ))}
            </span>
          </div>
        )
      })}
      {matchup.winnerId && (
        <p className="mt-1 text-center font-led text-[9px] tracking-[0.25em] text-gold">
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
      <LedTicker
        text={`${activeRound.name} · ${
          activeMatchup
            ? `${entryName(match, activeMatchup.higherId)} VS ${entryName(match, activeMatchup.lowerId)} · GAME ${activeMatchup.games.length + 1}`
            : 'ROUND COMPLETE'
        }`}
      />

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-3">
          {match.playoffRounds.map((round) => (
            <JumboPanel key={round.name} title={round.name}>
              <div className="grid gap-2">
                {round.matchups.map((m, i) => (
                  <SeriesCard key={i} match={match} matchup={m} />
                ))}
              </div>
            </JumboPanel>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {latest ? (
            <ScoreboardPanel match={match} result={latest} />
          ) : (
            <JumboPanel>
              <p className="py-10 text-center font-led text-sm tracking-[0.3em] text-mist">THE BRACKET IS SET…</p>
            </JumboPanel>
          )}
          {canControl && (
            <div className="flex flex-wrap justify-center gap-3">
              <NeonButton onClick={() => dispatch({ type: 'SIM_NEXT' })} disabled={autoSimming}>
                SIM NEXT GAME
              </NeonButton>
              <NeonButton color="ember" onClick={simAllRemaining}>
                {autoSimming ? '■ STOP' : '▶▶ SIM THE REST'}
              </NeonButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- champion

const CONFETTI_COLORS = ['#ffd45c', '#ffb300', '#ff4d2e', '#4dd8ff', '#c77dff', '#f4f2ec']

export function ChampionScreen({ match }: { match: MatchState }) {
  const { myId, goHome } = useGame()
  const champion = match.entries.find((e) => e.id === match.championId)
  const itsMe = match.championId === myId

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-6 overflow-hidden px-4 py-10 text-center">
      {Array.from({ length: 60 }, (_, i) => (
        <span
          key={i}
          className="animate-confetti pointer-events-none absolute top-0 block"
          style={{
            left: `${(i * 137.5) % 100}%`,
            width: 7,
            height: 13,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 20) * 0.16}s`,
            animationDuration: `${2.6 + (i % 5) * 0.4}s`,
          }}
        />
      ))}

      <p className="font-led text-xs font-bold tracking-[0.5em] text-mist">AND YOUR CHAMPION IS</p>

      <div
        className="flex h-40 w-40 items-center justify-center rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #fff3c4, #ffd45c 35%, #b8860b 75%, #6b4e00)',
          boxShadow: '0 0 60px rgba(255, 212, 92, 0.55), inset 0 -6px 18px rgba(0,0,0,0.4)',
        }}
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-arena font-display text-5xl">
          🏆
        </div>
      </div>

      <h1 className="neon-text font-display text-6xl leading-none tracking-wide sm:text-7xl">{champion?.name}</h1>
      {itsMe && <p className="font-led text-lg font-black tracking-[0.3em] text-gold">YOU GOT THE RING! 💍</p>}

      <div className="grid w-full gap-2">
        {match.finalsMvp && (
          <p className="font-led text-[11px] tracking-[0.25em] text-ice">
            FINALS MVP: {match.finalsMvp.name.toUpperCase()} · {match.finalsMvp.statLine}
          </p>
        )}
        {match.seasonMvp && (
          <p className="font-led text-[11px] tracking-[0.25em] text-superstar">
            SEASON MVP: {match.seasonMvp.name.toUpperCase()} · {match.seasonMvp.statLine}
          </p>
        )}
      </div>

      <NeonButton onClick={goHome}>RUN IT BACK →</NeonButton>
    </div>
  )
}

// ----------------------------------------------------------------- trophies

export function TrophiesScreen() {
  const { trophies, goHome } = useGame()
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-5 px-4 py-10">
      <h1 className="text-center font-display text-4xl tracking-wide text-chalk">🏆 TROPHY CASE</h1>
      <JumboPanel>
        {trophies.length === 0 ? (
          <p className="py-8 text-center font-led text-xs tracking-[0.3em] text-mist">NO RINGS YET. GO CHASE ONE.</p>
        ) : (
          <ul className="grid gap-2">
            {trophies.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg border border-bezel bg-panel-deep px-4 py-2.5">
                <span>
                  <span className={`block font-display text-lg tracking-wide ${t.championWasMe ? 'text-gold' : 'text-chalk'}`}>
                    {t.championName} {t.championWasMe && '💍'}
                  </span>
                  <span className="font-led text-[9px] tracking-widest text-mist">
                    {new Date(t.wonAt).toLocaleDateString()} · {t.format.toUpperCase()} · {t.leagueSize} TEAMS
                    {t.finalsMvpName ? ` · FMVP ${t.finalsMvpName.toUpperCase()}` : ''}
                  </span>
                </span>
                <span className="text-2xl">🏆</span>
              </li>
            ))}
          </ul>
        )}
      </JumboPanel>
      <div className="flex justify-center">
        <NeonButton color="steel" onClick={goHome}>
          BACK
        </NeonButton>
      </div>
    </div>
  )
}
