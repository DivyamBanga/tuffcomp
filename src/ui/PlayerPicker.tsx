import type { Formation } from '../engine/formations'
import { bestCompatibility } from '../engine/positions'
import { useGameStore } from '../game/store'
import type { Squad } from '../types'

interface PlayerPickerProps {
  squad: Squad
  formation: Formation
  slotId: string
  assignments: Record<string, string | null>
  onClose: () => void
}

const TIER_LABEL: Record<number, string> = {
  1: 'Natural',
  0.75: 'Secondary',
  0.5: 'Stretch',
}

export function PlayerPicker({ squad, formation, slotId, assignments, onClose }: PlayerPickerProps) {
  const assignPlayer = useGameStore((s) => s.assignPlayer)
  const clearSlot = useGameStore((s) => s.clearSlot)
  const slot = formation.slots.find((s) => s.id === slotId)
  if (!slot) return null

  const usedElsewhere = new Set(
    Object.entries(assignments)
      .filter(([id, playerId]) => id !== slotId && playerId)
      .map(([, playerId]) => playerId),
  )

  const eligible = squad.players
    .filter((p) => !usedElsewhere.has(p.id))
    .map((p) => ({ player: p, fit: bestCompatibility(p.positions, slot.position) }))
    .filter(({ fit }) => fit > 0)
    .sort((a, b) => b.fit - a.fit || b.player.overall - a.player.overall)

  const currentPlayerId = assignments[slotId]

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[75vh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl tracking-wide text-chalk">{slot.position}</h3>
          <button
            type="button"
            onClick={onClose}
            className="font-display text-sm tracking-wide text-mist hover:text-chalk"
          >
            CLOSE
          </button>
        </div>

        {currentPlayerId && (
          <button
            type="button"
            onClick={() => {
              clearSlot(slotId)
              onClose()
            }}
            className="mb-3 w-full rounded-xl border border-white/15 py-2.5 font-display text-sm tracking-wide text-mist transition hover:border-white/30 hover:text-chalk"
          >
            REMOVE PLAYER
          </button>
        )}

        <ul className="flex flex-col gap-2">
          {eligible.map(({ player, fit }) => (
            <li key={player.id}>
              <button
                type="button"
                onClick={() => {
                  assignPlayer(slotId, player.id)
                  onClose()
                }}
                className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition ${
                  player.id === currentPlayerId
                    ? 'bg-lime text-ink'
                    : 'bg-ink-soft text-chalk hover:bg-white/10'
                }`}
              >
                <span className="flex flex-col">
                  <span className="font-semibold">{player.name}</span>
                  <span className={`text-xs ${player.id === currentPlayerId ? 'text-ink/70' : 'text-mist'}`}>
                    {player.positions.join(' / ')} · {TIER_LABEL[fit]}
                  </span>
                </span>
                <span className="font-display text-2xl">{player.overall}</span>
              </button>
            </li>
          ))}
        </ul>

        {eligible.length === 0 && (
          <p className="py-10 text-center text-sm text-mist">No eligible players left for this slot.</p>
        )}
      </div>
    </div>
  )
}
