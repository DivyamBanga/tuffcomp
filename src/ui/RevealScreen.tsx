import { motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { flagFor } from './flags'

export function RevealScreen() {
  const squad = useGameStore((s) => s.squad)
  const confirmReveal = useGameStore((s) => s.confirmReveal)
  const reset = useGameStore((s) => s.reset)

  if (!squad) return null

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-lime/30 bg-gradient-to-b from-turf to-turf-dark px-8 py-14 shadow-[0_0_60px_-15px_rgba(198,255,61,0.4)]"
      >
        <motion.div
          initial={{ x: '-130%' }}
          animate={{ x: '130%' }}
          transition={{ duration: 1.1, delay: 0.4, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />
        <p className="font-display text-sm tracking-[0.5em] text-lime">TEAM-YEAR</p>
        <span className="mt-4 block text-7xl">{flagFor(squad.team)}</span>
        <h2 className="mt-4 font-display text-5xl tracking-wide text-chalk">{squad.team}</h2>
        <p className="font-display text-3xl tracking-widest text-gold">{squad.year}</p>
        <p className="mt-3 text-xs uppercase tracking-widest text-mist">
          {squad.players.length} players available
        </p>
      </motion.div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-white/15 px-6 py-3 font-display text-sm tracking-wide text-mist transition hover:border-white/30 hover:text-chalk"
        >
          SPIN AGAIN
        </button>
        <button
          type="button"
          onClick={confirmReveal}
          className="rounded-full bg-lime px-8 py-3 font-display text-sm tracking-wide text-ink transition hover:bg-lime-dim"
        >
          BUILD LINEUP
        </button>
      </div>
    </div>
  )
}
