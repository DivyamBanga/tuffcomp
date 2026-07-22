import { useEffect, useRef, useState } from 'react'
import { FORMATION_433 } from '../engine/formations'
import { bestCompatibility } from '../engine/positions'
import { useGameStore } from '../game/store'
import type { Squad } from '../types'
import { flagFor } from './flags'

const SPIN_TICKS = 14
const TICK_MS_START = 60
const TICK_MS_END = 190

export function SpinPickSheet() {
  const allSquads = useGameStore((s) => s.allSquads)
  const assignments = useGameStore((s) => s.assignments)
  const pendingSlotId = useGameStore((s) => s.pendingSlotId)
  const pendingSquad = useGameStore((s) => s.pendingSquad)
  const revealForSlot = useGameStore((s) => s.revealForSlot)
  const rerollPending = useGameStore((s) => s.rerollPending)
  const cancelPending = useGameStore((s) => s.cancelPending)
  const pickPlayer = useGameStore((s) => s.pickPlayer)

  const [previewSquad, setPreviewSquad] = useState<Squad | null>(null)
  const tickRef = useRef(0)

  const spinning = pendingSlotId !== null && pendingSquad === null

  useEffect(() => {
    if (!spinning || allSquads.length === 0) return
    tickRef.current = 0
    let timeoutId: number

    function tick() {
      tickRef.current += 1
      setPreviewSquad(allSquads[Math.floor(Math.random() * allSquads.length)])
      if (tickRef.current >= SPIN_TICKS) {
        revealForSlot()
        return
      }
      const progress = tickRef.current / SPIN_TICKS
      timeoutId = window.setTimeout(tick, TICK_MS_START + (TICK_MS_END - TICK_MS_START) * progress ** 2)
    }
    tick()

    return () => window.clearTimeout(timeoutId)
  }, [spinning, allSquads, revealForSlot])

  if (pendingSlotId === null) return null

  const slot = FORMATION_433.slots.find((s) => s.id === pendingSlotId)
  if (!slot) return null

  const usedIds = new Set(Object.values(assignments).filter(Boolean).map((p) => p!.id))
  const eligible = pendingSquad
    ? pendingSquad.players
        .map((player) => ({ player, fit: bestCompatibility(player.positions, slot.position) }))
        .filter(({ player, fit }) => fit > 0 && !usedIds.has(player.id))
        .sort((a, b) => b.fit - a.fit || b.player.overall - a.player.overall)
    : []

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/85 backdrop-blur-sm">
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl tracking-wide text-chalk">FILLING {slot.label}</h3>
          <button
            type="button"
            onClick={cancelPending}
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
                onClick={rerollPending}
                className="font-display text-xs tracking-wide text-lime hover:text-lime-dim"
              >
                SPIN AGAIN
              </button>
            </div>

            <ul className="flex flex-col gap-2">
              {eligible.map(({ player, fit }) => (
                <li key={player.id}>
                  <button
                    type="button"
                    onClick={() => pickPlayer(player)}
                    className="flex w-full items-center justify-between rounded-xl bg-ink-soft px-4 py-3 text-left text-chalk transition hover:bg-white/10"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{player.name}</span>
                      <span className="text-xs text-mist">{fit < 1 ? 'Stretch fit' : slot.label}</span>
                    </span>
                    <span className="font-display text-2xl">{player.overall}</span>
                  </button>
                </li>
              ))}
            </ul>

            {eligible.length === 0 && (
              <p className="py-10 text-center text-sm text-mist">
                No eligible players left in this squad for {slot.label}. Try spinning again.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
