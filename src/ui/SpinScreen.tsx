import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { SQUADS } from '../data/loadSquads'
import { useGameStore } from '../game/store'
import { flagFor } from './flags'

const SPIN_TICKS = 18
const TICK_MS_START = 70
const TICK_MS_END = 230

export function SpinScreen() {
  const spinSquad = useGameStore((s) => s.spinSquad)
  const [spinning, setSpinning] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const tickRef = useRef(0)

  useEffect(() => {
    if (!spinning) return
    let timeoutId: number

    function tick() {
      tickRef.current += 1
      setPreviewIndex(Math.floor(Math.random() * SQUADS.length))
      if (tickRef.current >= SPIN_TICKS) {
        spinSquad()
        return
      }
      const progress = tickRef.current / SPIN_TICKS
      const delay = TICK_MS_START + (TICK_MS_END - TICK_MS_START) * progress ** 2
      timeoutId = window.setTimeout(tick, delay)
    }
    tick()

    return () => window.clearTimeout(timeoutId)
  }, [spinning, spinSquad])

  function handleSpin() {
    tickRef.current = 0
    setSpinning(true)
  }

  const preview = SQUADS[previewIndex]

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div>
        <p className="font-display text-sm tracking-[0.5em] text-lime">TUFFCOMP</p>
        <h1 className="font-display text-6xl leading-[0.95] tracking-wide text-chalk sm:text-7xl">
          BUILD THE
          <br />
          <span className="text-lime">BEST XI</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xs text-sm text-mist">
          Spin a real World Cup squad, then slot every player into a position they can actually
          play.
        </p>
      </div>

      <div className="relative flex h-40 w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-panel">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-panel to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-panel to-transparent" />
        <motion.div
          key={spinning ? previewIndex : 'idle'}
          initial={{ y: spinning ? -18 : 0, opacity: spinning ? 0.3 : 1 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.08 }}
          className="flex flex-col items-center gap-1"
        >
          <span className="text-4xl">{spinning ? flagFor(preview.team) : '🎲'}</span>
          <span className="font-display text-2xl tracking-wide text-chalk">
            {spinning ? `${preview.team} ${preview.year}` : 'READY?'}
          </span>
        </motion.div>
      </div>

      <button
        type="button"
        onClick={handleSpin}
        disabled={spinning}
        className="rounded-full bg-lime px-10 py-4 font-display text-xl tracking-wide text-ink transition hover:bg-lime-dim disabled:opacity-60"
      >
        {spinning ? 'SPINNING…' : 'SPIN'}
      </button>
    </div>
  )
}
