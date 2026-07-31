import { useEffect, useRef, useState } from 'react'
import { currentRound, ROUNDS } from '../game/draft'
import { useGame } from '../game/store'
import type { MatchState } from '../game/match'
import { ALL_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import { Btn, Headshot, MiniCard, PlayerCard, Sheet, StatusLine } from './components'

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
      <StatusLine
        text={`ROUND ${round} OF ${ROUNDS} · PICK ${draft.pickIndex + 1}/${draft.order.length} · ${
          myTurn ? 'YOU ARE ON THE CLOCK' : `${turnPlayer?.name ?? '...'} IS ON THE CLOCK`
        }`}
      />

      <Sheet
        title={`ROUND ${round} · ${String(tierLabel)} SPIN`}
        right={
          <span className={`plate !text-[9px] ${myTurn ? 'animate-pulse text-hot' : ''}`}>
            {myTurn ? '▶ YOUR SPIN' : `${turnPlayer?.name ?? ''}'S SPIN`}
          </span>
        }
      >
        {spinning && myTurn ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <div className="sheet h-36 w-36 overflow-hidden">
              {flicker && <Headshot card={flicker} className="h-full w-full" />}
            </div>
            <p className="plate animate-pulse !text-[10px] text-hot">DEALING…</p>
          </div>
        ) : offer ? (
          <>
            <div className="flex flex-wrap justify-center gap-3">
              {offer.cards.map((card, i) => (
                <PlayerCard
                  key={card.id}
                  card={card}
                  delayMs={i * 80}
                  onClick={myTurn ? () => dispatch({ type: 'DRAFT', action: { type: 'TAKE', playerId: myId, cardId: card.id } }) : undefined}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center gap-4">
              {myTurn ? (
                <>
                  <Btn
                    disabled={myTeam.rerollsLeft <= 0}
                    onClick={() => dispatch({ type: 'DRAFT', action: { type: 'REROLL', playerId: myId } })}
                  >
                    ↻ REROLL · {myTeam.rerollsLeft} LEFT
                  </Btn>
                  <span className="plate plate-faint !text-[9px]">TAP A CARD TO DRAFT</span>
                </>
              ) : (
                <span className="plate animate-pulse !text-[9px]">WAITING FOR {turnPlayer?.name?.toUpperCase() ?? '...'}</span>
              )}
            </div>
          </>
        ) : null}
      </Sheet>

      <div className="grid gap-3 md:grid-cols-2">
        {draft.players.map((p) => {
          const team = draft.teams[p.id]
          return (
            <Sheet
              key={p.id}
              title={`${p.name}${p.id === myId ? ' (YOU)' : ''}${p.isCpu ? ' · CPU' : ''}`}
              right={<span className="plate plate-faint !text-[9px]">↻ {team.rerollsLeft}</span>}
              className={p.id === turnId ? '!border-hot' : ''}
            >
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {ALL_SLOTS.map((slot) => (
                  <MiniCard key={slot} label={slot} card={team.roster[slot]} />
                ))}
              </div>
            </Sheet>
          )
        })}
      </div>
    </div>
  )
}
