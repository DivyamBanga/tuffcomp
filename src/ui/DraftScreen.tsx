import { useEffect, useRef, useState } from 'react'
import { currentRound, ROUNDS } from '../game/draft'
import { useGame } from '../game/store'
import type { MatchState } from '../game/match'
import { ALL_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import { Headshot, JumboPanel, LedTicker, MiniCard, NeonButton, PlayerCard } from './components'

const SPIN_MS = 1150

export function DraftScreen({ match }: { match: MatchState }) {
  const { myId, dispatch } = useGame()
  const draft = match.draft!
  const turnId = draft.order[draft.pickIndex]
  const turnPlayer = draft.players.find((p) => p.id === turnId)
  const myTurn = turnId === myId
  const round = currentRound(draft)
  const offer = draft.offer
  const myTeam = draft.teams[myId]

  // Slot-machine intro every time a fresh offer lands for me.
  const [spinning, setSpinning] = useState(false)
  const [flicker, setFlicker] = useState<Card | null>(null)
  const lastOfferKey = useRef('')

  useEffect(() => {
    const key = offer ? `${offer.forPlayerId}:${draft.spinCount}` : ''
    if (!offer || key === lastOfferKey.current) return
    lastOfferKey.current = key
    if (offer.forPlayerId !== myId) return
    setSpinning(true)
    let ticks = 0
    const interval = window.setInterval(() => {
      setFlicker(offer.cards[ticks % offer.cards.length])
      ticks++
    }, 110)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      setSpinning(false)
    }, SPIN_MS)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [offer, draft.spinCount, myId])

  const tierLabel = offer?.tier ?? 'MYSTERY'

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-3 py-5">
      <LedTicker
        text={`ROUND ${round} OF ${ROUNDS} · PICK ${draft.pickIndex + 1}/${draft.order.length} · ${
          myTurn ? 'YOU ARE ON THE CLOCK' : `${turnPlayer?.name ?? '...'} IS ON THE CLOCK`
        }`}
      />

      <JumboPanel
        title={`ROUND ${round} · ${String(tierLabel)} SPIN`}
        right={
          <span className={`font-led text-xs font-bold tracking-[0.25em] ${myTurn ? 'neon-text animate-pulse-glow' : 'text-mist'}`}>
            {myTurn ? '▶ YOUR SPIN' : `${turnPlayer?.name ?? ''}'S SPIN`}
          </span>
        }
      >
        {spinning && myTurn ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <div className="bezel h-36 w-36 overflow-hidden rounded-xl">
              {flicker && <Headshot card={flicker} className="h-full w-full" />}
            </div>
            <p className="animate-pulse-glow font-led text-sm font-bold tracking-[0.4em] text-neon">SPINNING…</p>
          </div>
        ) : offer ? (
          <>
            <div className="flex flex-wrap justify-center gap-3">
              {offer.cards.map((card, i) => (
                <PlayerCard
                  key={card.id}
                  card={card}
                  delayMs={i * 90}
                  onClick={myTurn ? () => dispatch({ type: 'DRAFT', action: { type: 'TAKE', playerId: myId, cardId: card.id } }) : undefined}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center gap-4">
              {myTurn ? (
                <>
                  <NeonButton
                    color="ember"
                    className="!text-base"
                    disabled={myTeam.rerollsLeft <= 0}
                    onClick={() => dispatch({ type: 'DRAFT', action: { type: 'REROLL', playerId: myId } })}
                  >
                    ↻ REROLL ({myTeam.rerollsLeft} LEFT)
                  </NeonButton>
                  <span className="font-led text-[10px] tracking-[0.25em] text-mist">TAP A CARD TO DRAFT</span>
                </>
              ) : (
                <span className="animate-pulse-glow font-led text-[11px] tracking-[0.3em] text-mist">
                  WAITING FOR {turnPlayer?.name?.toUpperCase() ?? '...'}
                </span>
              )}
            </div>
          </>
        ) : null}
      </JumboPanel>

      <div className="grid gap-3 md:grid-cols-2">
        {draft.players.map((p) => {
          const team = draft.teams[p.id]
          return (
            <JumboPanel
              key={p.id}
              title={`${p.name}${p.id === myId ? ' (YOU)' : ''}${p.isCpu ? ' · CPU' : ''}`}
              right={<span className="font-led text-[10px] tracking-widest text-mist">↻ {team.rerollsLeft}</span>}
              className={p.id === turnId ? 'ring-2 ring-neon/60' : ''}
            >
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {ALL_SLOTS.map((slot) => (
                  <MiniCard key={slot} label={slot} card={team.roster[slot]} />
                ))}
              </div>
            </JumboPanel>
          )
        })}
      </div>
    </div>
  )
}
