import { motion } from 'motion/react'
import { FORMATION_433 } from '../engine/formations'
import type { Player } from '../types'
import { slotCoordinates } from './pitchLayout'

interface PitchProps {
  assignments: Record<string, Player | null>
  onEmptySlotClick: (slotId: string) => void
  onFilledSlotClick: (slotId: string) => void
}

export function Pitch({ assignments, onEmptySlotClick, onFilledSlotClick }: PitchProps) {
  return (
    <div className="pitch-stripes relative mx-auto mt-4 aspect-[3/4] w-full max-w-sm flex-1 overflow-hidden rounded-3xl border border-white/10 bg-turf shadow-inner">
      <div className="absolute inset-3 rounded-2xl border-2 border-white/15" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/15" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />

      {FORMATION_433.slots.map((slot) => {
        const { x, y } = slotCoordinates(slot.id)
        const player = assignments[slot.id]

        return (
          <button
            key={slot.id}
            type="button"
            onClick={() => (player ? onFilledSlotClick(slot.id) : onEmptySlotClick(slot.id))}
            style={{ left: `${x}%`, top: `${y}%` }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
          >
            <motion.span
              key={player?.id ?? 'empty'}
              initial={{ scale: player ? 0.6 : 1, opacity: player ? 0 : 1 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              className={`relative flex h-12 w-12 items-center justify-center rounded-full border-2 font-display text-base shadow-lg ${
                player
                  ? 'border-gold bg-ink text-gold'
                  : 'animate-pulse border-dashed border-white/40 bg-white/10 text-white/50'
              }`}
            >
              {player ? player.overall : slot.label}
              {player && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] text-mist">
                  ×
                </span>
              )}
            </motion.span>
            <span className="max-w-[4.5rem] truncate font-display text-[11px] tracking-wide text-chalk/90">
              {player ? player.name.split(' ').at(-1) : slot.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
