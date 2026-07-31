import { useState } from 'react'
import { evaluateTeam } from '../engine/evaluate'
import { ALL_SLOTS, type SlotId } from '../engine/lineup'
import { useGame } from '../game/store'
import type { MatchState } from '../game/match'
import { Btn, Meter, MiniCard, Sheet, StatusLine } from './components'

export function PreviewScreen({ match }: { match: MatchState }) {
  const { myId, dispatch, sessionMode, startCompetition, judging, judgeArmed } = useGame()
  const [viewId, setViewId] = useState(myId in match.rosters ? myId : match.entries[0].id)
  const [swapFrom, setSwapFrom] = useState<SlotId | null>(null)

  const canControl = sessionMode !== 'guest' // host or solo can begin
  const roster = match.rosters[viewId]
  const evaluation = evaluateTeam(roster)
  const viewingMine = viewId === myId
  const scout = match.judge?.teams[viewId] ?? null

  function tapSlot(slot: SlotId) {
    if (!viewingMine) return
    if (swapFrom === null) {
      setSwapFrom(slot)
      return
    }
    if (swapFrom !== slot) {
      dispatch({ type: 'MOVE_AFTER_DRAFT', playerId: myId, from: swapFrom, to: slot })
    }
    setSwapFrom(null)
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-3 py-5">
      <StatusLine text="DRAFT COMPLETE · SET YOUR LINEUP · TAP TWO SLOTS TO SWAP · THEN IT'S GAME TIME" />

      <div className="flex flex-wrap justify-center gap-2">
        {match.entries.map((entry) => (
          <Btn
            key={entry.id}
            on={viewId === entry.id}
            onClick={() => {
              setViewId(entry.id)
              setSwapFrom(null)
            }}
            className="!px-3 !py-1.5"
          >
            {entry.name}
            {entry.id === myId ? ' ●' : ''}
          </Btn>
        ))}
      </div>

      <Sheet
        title={`${match.entries.find((e) => e.id === viewId)?.name ?? ''} · TEAM POWER ${evaluation.power}`}
        right={viewingMine ? <span className="plate !text-[9px] text-hot">TAP 2 SLOTS TO SWAP</span> : undefined}
      >
        <div className="grid gap-5 md:grid-cols-[1fr_230px]">
          <div>
            <div className="plate plate-faint mb-2 !text-[9px]">STARTING FIVE</div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {ALL_SLOTS.slice(0, 5).map((slot) => (
                <MiniCard
                  key={slot}
                  label={slot}
                  card={roster[slot]}
                  onClick={viewingMine ? () => tapSlot(slot) : undefined}
                  highlight={swapFrom === slot}
                />
              ))}
            </div>
            <div className="plate plate-faint mb-2 mt-4 !text-[9px]">BENCH</div>
            <div className="grid grid-cols-3 gap-1.5">
              {ALL_SLOTS.slice(5).map((slot) => (
                <MiniCard
                  key={slot}
                  label={slot}
                  card={roster[slot]}
                  onClick={viewingMine ? () => tapSlot(slot) : undefined}
                  highlight={swapFrom === slot}
                />
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink/85">{evaluation.summary}</p>
            {evaluation.duos.length > 0 && (
              <p className="plate mt-2 !text-[9px]">REAL DUOS: {evaluation.duos.join(' · ')}</p>
            )}
            {scout && (
              <div className="mt-4 border border-line p-3">
                <div className="flex items-baseline justify-between">
                  <span className="plate !text-[9px]">SCOUT'S TAKE · CLAUDE</span>
                  <span className="num text-[9.5px] text-faint">
                    OFF {scout.offense} · DEF {scout.defense} · STAR {scout.star} · FIT {scout.cohesion}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-snug text-ink/90">{scout.blurb}</p>
              </div>
            )}
          </div>
          <div className="grid content-start gap-3.5">
            <Meter label="QUALITY" value={evaluation.quality} />
            <Meter label="FIT" value={evaluation.fit} />
            <Meter label="CHEMISTRY" value={evaluation.chemistry} />
            <Meter label="BALANCE" value={evaluation.balance} />
            <div className="num mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[9.5px] text-dim">
              {evaluation.needs.map((need) => (
                <span key={need.name} className={`flex justify-between ${need.score < 40 ? 'text-ink' : ''}`}>
                  <span className="uppercase tracking-wider">{need.name}</span>
                  <span>{need.score}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </Sheet>

      <div className="flex flex-col items-center gap-2">
        {canControl ? (
          <>
            <Btn primary onClick={() => void startCompetition()} disabled={judging}>
              {judging
                ? 'THE SCOUT IS WATCHING FILM…'
                : match.config.format === 'season'
                  ? 'TIP OFF THE SEASON →'
                  : 'START THE PLAYOFFS →'}
            </Btn>
            {judgeArmed && !match.judge && !judging && (
              <span className="plate plate-faint !text-[8.5px]">AI SCOUT ARMED · JUDGES EVERY TEAM AT TIP-OFF</span>
            )}
          </>
        ) : (
          <StatusLine text="WAITING FOR HOST TO TIP OFF…" className="!border-0" />
        )}
      </div>
    </div>
  )
}
