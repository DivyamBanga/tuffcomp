import { useEffect, useRef, useState } from 'react'
import { hasEligibleOpenSlot, useGameStore } from '../game/store'
import type { Squad } from '../types'
import { flagFor } from './flags'

const SPIN_TICKS = 14
const TICK_MS_START = 60
const TICK_MS_END = 190

const POSITION_LABEL: Record<string, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
}

export function SpinPickSheet() {
  const allSquads = useGameStore((s) => s.allSquads)
  const assignments = useGameStore((s) => s.assignments)
  const spinOpen = useGameStore((s) => s.spinOpen)
  const pendingSquad = useGameStore((s) => s.pendingSquad)
  const revealSquad = useGameStore((s) => s.revealSquad)
  const rerollSquad = useGameStore((s) => s.rerollSquad)
  const cancelSpin = useGameStore((s) => s.cancelSpin)
  const selectPlayer = useGameStore((s) => s.selectPlayer)

  const [previewSquad, setPreviewSquad] = useState<Squad | null>(null)
  const tickRef = useRef(0)

  const spinning = spinOpen && pendingSquad === null

  useEffect(() => {
    if (!spinning || allSquads.length === 0) return
    tickRef.current = 0
    let timeoutId: number

    function tick() {
      tickRef.current += 1
      setPreviewSquad(allSquads[Math.floor(Math.random() * allSquads.length)])
      if (tickRef.current >= SPIN_TICKS) {
        revealSquad()
        return
      }
      const progress = tickRef.current / SPIN_TICKS
      timeoutId = window.setTimeout(tick, TICK_MS_START + (TICK_MS_END - TICK_MS_START) * progress ** 2)
    }
    tick()

    return () => window.clearTimeout(timeoutId)
  }, [spinning, allSquads, revealSquad])

  if (!spinOpen) return null

  const eligible = pendingSquad
    ? pendingSquad.players
        .filter((player) => hasEligibleOpenSlot(player, assignments))
        .sort((a, b) => b.overall - a.overall)
    : []

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/85 backdrop-blur-sm">
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl tracking-wide text-chalk">
            {spinning ? 'SPINNING' : 'PICK A PLAYER'}
          </h3>
          <button
            type="button"
            onClick={cancelSpin}
            className="font-display text-sm tracking-wide text-mist hover:text-chalk"
          >
            CANCEL
          </button>
        </div>

        {spinning && (
          <div className="flex flex-col items-center gap-2 py-14">
            <span className="text-4xl">{previewSquad ? flagFor(previewSquad.team) : '🎲'}</span>
            <span className="font-display text-2xl tracking-wide text-chalk">
              {previewSquad ? `${previewSquad.team} ${previewSquad.year}` : 'SPINNING…'}
            </span>
          </div>
        )}

        {!spinning && pendingSquad && (
          <>
            <div className="mb-3 flex items-center justify-between rounded-xl bg-ink-soft px-4 py-3">
              <span className="flex items-center gap-2 font-display text-lg tracking-wide text-chalk">
                {flagFor(pendingSquad.team)} {pendingSquad.team} {pendingSquad.year}
              </span>
              <button
                type="button"
                onClick={rerollSquad}
                className="font-display text-xs tracking-wide text-lime hover:text-lime-dim"
              >
                SPIN AGAIN
              </button>
            </div>

            <ul className="flex flex-col gap-2">
              {eligible.map((player) => (
                <li key={player.id}>
                  <button
                    type="button"
                    onClick={() => selectPlayer(player)}
                    className="flex w-full items-center justify-between rounded-xl bg-ink-soft px-4 py-3 text-left text-chalk transition hover:bg-white/10"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{player.name}</span>
                      <span className="text-xs text-mist">{POSITION_LABEL[player.positions[0]]}</span>
                    </span>
                    <span className="font-display text-2xl">{player.overall}</span>
                  </button>
                </li>
              ))}
            </ul>

            {eligible.length === 0 && (
              <p className="py-10 text-center text-sm text-mist">
                No one in this squad fits your open slots. Try spinning again.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
