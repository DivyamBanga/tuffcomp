import { useState } from 'react'
import { evaluateTeam } from '../engine/evaluate'
import { ALL_SLOTS, type SlotId } from '../engine/lineup'
import { useGame } from '../game/store'
import type { MatchState } from '../game/match'
import { JumboPanel, LedTicker, MiniCard, NeonButton, PowerMeter } from './components'

export function PreviewScreen({ match }: { match: MatchState }) {
  const { myId, dispatch, sessionMode } = useGame()
  const [viewId, setViewId] = useState(myId in match.rosters ? myId : match.entries[0].id)
  const [swapFrom, setSwapFrom] = useState<SlotId | null>(null)

  const canControl = sessionMode !== 'guest' // host or solo can begin
  const roster = match.rosters[viewId]
  const evaluation = evaluateTeam(roster)
  const viewingMine = viewId === myId

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
      <LedTicker text="DRAFT COMPLETE · SET YOUR LINEUP · TAP TWO SLOTS TO SWAP · THEN IT'S GAME TIME" />

      <div className="flex flex-wrap justify-center gap-2">
        {match.entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setViewId(entry.id)
              setSwapFrom(null)
            }}
            className={`btn-arcade px-3 py-1.5 font-led text-xs font-bold tracking-wider ${
              viewId === entry.id ? 'bg-neon text-arena' : 'bg-panel-deep text-mist'
            }`}
          >
            {entry.name}
            {entry.id === myId ? ' ★' : ''}
          </button>
        ))}
      </div>

      <JumboPanel
        title={`${match.entries.find((e) => e.id === viewId)?.name ?? ''} · TEAM POWER ${evaluation.power}`}
        right={viewingMine ? <span className="font-led text-[10px] tracking-widest text-neon">TAP 2 SLOTS TO SWAP</span> : undefined}
      >
        <div className="grid gap-4 md:grid-cols-[1fr_240px]">
          <div>
            <div className="mb-2 font-led text-[10px] tracking-[0.3em] text-mist">STARTING FIVE</div>
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
            <div className="mb-2 mt-4 font-led text-[10px] tracking-[0.3em] text-mist">BENCH</div>
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
            <p className="mt-4 text-sm leading-relaxed text-chalk/85">{evaluation.summary}</p>
            {evaluation.duos.length > 0 && (
              <p className="mt-1 font-led text-[10px] tracking-widest text-ice">REAL DUOS: {evaluation.duos.join(' · ')}</p>
            )}
          </div>
          <div className="grid content-start gap-3">
            <PowerMeter label="QUALITY" value={evaluation.quality} />
            <PowerMeter label="FIT" value={evaluation.fit} />
            <PowerMeter label="CHEMISTRY" value={evaluation.chemistry} />
            <PowerMeter label="BALANCE" value={evaluation.balance} />
            <div className="mt-1 grid grid-cols-2 gap-1 font-led text-[9px] tracking-wider text-mist">
              {evaluation.needs.map((need) => (
                <span key={need.name} className={need.score < 40 ? 'text-ember' : ''}>
                  {need.name.toUpperCase()}: {need.score}
                </span>
              ))}
            </div>
          </div>
        </div>
      </JumboPanel>

      <div className="flex justify-center">
        {canControl ? (
          <NeonButton onClick={() => dispatch({ type: 'BEGIN_COMPETITION' })}>
            {match.config.format === 'season' ? 'TIP OFF THE SEASON →' : 'START THE PLAYOFFS →'}
          </NeonButton>
        ) : (
          <p className="animate-pulse-glow font-led text-xs tracking-[0.3em] text-mist">WAITING FOR HOST TO TIP OFF…</p>
        )}
      </div>
    </div>
  )
}
