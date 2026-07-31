import { useEffect, useRef, useState } from 'react'
import { loadCards } from '../data/loadCards'
import { currentRound, ROUNDS, STRIKES_PER_PLAYER, type DraftState, type TypeFeedback } from '../game/draft'
import { THEMES, suggestNames, themeById } from '../game/themes'
import { useGame } from '../game/store'
import type { MatchState } from '../game/match'
import { ALL_SLOTS } from '../engine/lineup'
import type { Card } from '../types'
import { Btn, Headshot, MiniCard, PlayerCard, Sheet, StatusLine } from './components'

const SPIN_MS = 1150
const REVEAL_MS = 1400

function whiffLine(feedback: TypeFeedback): string {
  const name = feedback.matchedName?.toUpperCase()
  switch (feedback.outcome) {
    case 'no-match':
      return `NO PLAYER FOUND FOR “${feedback.query.toUpperCase()}” · NO STRIKE`
    case 'off-theme':
      return `${name} DOESN'T FIT THE THEME · STRIKE`
    case 'taken':
      return `${name} IS ALREADY GONE · STRIKE`
    case 'cant-fit':
      return `${name} CAN'T FILL YOUR OPEN STARTER SLOTS · STRIKE`
  }
}

function StrikeDots({ left }: { left: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {Array.from({ length: STRIKES_PER_PLAYER }, (_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < left ? 'bg-ink' : 'border border-line'}`} />
      ))}
    </span>
  )
}

// The draft's one theme deals itself once at the start: decoy labels
// cycle, then the real theme settles and holds for all 8 rounds.
function useThemeReveal(themed: boolean) {
  const [revealing, setRevealing] = useState(themed)
  const [decoy, setDecoy] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (!themed || started.current) return
    started.current = true
    let ticks = 0
    const interval = window.setInterval(() => {
      setDecoy(THEMES[(ticks * 7 + 3) % THEMES.length].label)
      ticks++
    }, 100)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      setRevealing(false)
    }, REVEAL_MS)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [themed])

  return { revealing, decoy }
}

// ------------------------------------------------------------- type-in form

function TypePickForm({ draft, myId }: { draft: DraftState; myId: string }) {
  const { dispatch } = useGame()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const [pool, setPool] = useState<Card[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const strikes = draft.teams[myId].strikesLeft
  const feedback = draft.lastType?.playerId === myId ? draft.lastType : null

  // Name index for autocomplete - spelling help over ALL players, never
  // filtered to the theme.
  useEffect(() => {
    let live = true
    void loadCards().then((cards) => {
      if (live) setPool(cards)
    })
    return () => {
      live = false
    }
  }, [])

  // A new pick of mine: clear the slate.
  useEffect(() => {
    setQuery('')
    setHighlight(-1)
    inputRef.current?.focus()
  }, [draft.pickIndex])

  const suggestions = pool && query.trim().length >= 2 ? suggestNames(pool, query) : []

  function callName(name: string) {
    if (name.trim().length < 2) return
    setHighlight(-1)
    dispatch({ type: 'DRAFT', action: { type: 'TYPE_PICK', playerId: myId, query: name.trim() } })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1))
    } else if (e.key === 'Escape') {
      setHighlight(-1)
    } else if (e.key === 'Enter') {
      callName(highlight >= 0 && suggestions[highlight] ? suggestions[highlight].name : query)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-6">
      <div key={feedback?.attempt ?? 0} className={`w-full ${feedback ? 'animate-shake' : ''}`}>
        <span className="plate plate-faint mb-1 block !text-[9px]">NAME YOUR PICK · BEST FITTING SEASON LANDS</span>
        <div className="relative">
          <div className="flex items-end gap-3">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value.slice(0, 32))
                setHighlight(-1)
              }}
              onKeyDown={onKeyDown}
              placeholder="steph curry"
              autoFocus
              autoComplete="off"
              className="field headline flex-1 text-2xl"
            />
            <Btn primary onClick={() => callName(query)} disabled={query.trim().length < 2} className="!py-2.5">
              CALL IT
            </Btn>
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 border border-line bg-paper">
              {suggestions.map((s, i) => (
                <li key={s.pid}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => callName(s.name)}
                    className={`block w-full px-3 py-1.5 text-left text-[13px] font-semibold transition-colors ${
                      i === highlight ? 'bg-paper2 text-ink' : 'text-dim'
                    }`}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex w-full items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="plate !text-[9px]">STRIKES</span>
          <StrikeDots left={strikes} />
        </span>
        <span className="plate plate-faint !text-[8.5px]">SPELLING HELP ONLY · IT WON'T SAY WHO FITS</span>
      </div>
      {feedback && <p className="plate !text-[10px] !tracking-[0.1em] text-ink">{whiffLine(feedback)}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ screen

export function DraftScreen({ match }: { match: MatchState }) {
  const { myId, dispatch } = useGame()
  const draft = match.draft!
  const turnId = draft.order[draft.pickIndex]
  const turnPlayer = draft.players.find((p) => p.id === turnId)
  const myTurn = turnId === myId
  const round = currentRound(draft)
  const offer = draft.offer
  const myTeam = draft.teams[myId]
  const themed = draft.mode === 'themes'
  const theme = themed ? themeById(draft.theme!) : null

  const { revealing, decoy } = useThemeReveal(themed)

  // Tiers mode: slot-machine intro every time a fresh offer lands for me.
  const [spinning, setSpinning] = useState(false)
  const [flicker, setFlicker] = useState<Card | null>(null)
  const lastOfferKey = useRef('')

  useEffect(() => {
    if (themed) return
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
  }, [offer, draft.spinCount, myId, themed])

  const lastPickPlayer = draft.players.find((p) => p.id === draft.lastPick?.playerId)
  const lastTypePlayer = draft.players.find((p) => p.id === draft.lastType?.playerId)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-3 py-5">
      <StatusLine
        text={`ROUND ${round} OF ${ROUNDS} · PICK ${draft.pickIndex + 1}/${draft.order.length} · ${
          myTurn ? 'YOU ARE ON THE CLOCK' : `${turnPlayer?.name ?? '...'} IS ON THE CLOCK`
        }`}
      />

      <Sheet
        title={themed ? `THEME DRAFT · ONE THEME, ALL ${ROUNDS} ROUNDS` : `ROUND ${round} · ${String(offer?.tier ?? 'MYSTERY')} SPIN`}
        right={
          <span className={`plate !text-[9px] ${myTurn ? 'animate-pulse text-hot' : ''}`}>
            {myTurn ? '▶ YOUR CALL' : `${turnPlayer?.name ?? ''}'S CALL`}
          </span>
        }
      >
        {themed && (
          <div className="mb-2 text-center">
            {revealing ? (
              <p className="headline text-3xl text-faint sm:text-4xl">{decoy || '· · ·'}</p>
            ) : (
              <>
                <p className="headline text-3xl text-ink sm:text-4xl">{theme!.label}</p>
                <p className="mt-1.5 text-[13px] text-dim">{theme!.detail}</p>
              </>
            )}
          </div>
        )}

        {themed && revealing ? (
          <p className="plate animate-pulse py-8 text-center !text-[10px]">DEALING THE DRAFT'S THEME…</p>
        ) : themed && myTurn && !offer ? (
          <TypePickForm draft={draft} myId={myId} />
        ) : !themed && spinning && myTurn ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <div className="sheet h-36 w-36 overflow-hidden">
              {flicker && <Headshot card={flicker} className="h-full w-full" />}
            </div>
            <p className="plate animate-pulse !text-[10px] text-hot">DEALING…</p>
          </div>
        ) : offer ? (
          <>
            {offer.themeFallback && (
              <p className="plate mb-3 text-center !text-[9px]">THEME EXHAUSTED FOR YOUR NEEDS · OPEN BOARD</p>
            )}
            {themed && myTurn && myTeam.strikesLeft <= 0 && !offer.themeFallback && (
              <p className="plate mb-3 text-center !text-[9px]">OUT OF STRIKES · THE BOARD BAILS YOU OUT</p>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              {offer.cards.map((card, i) => (
                <PlayerCard
                  key={card.id}
                  card={card}
                  delayMs={i * 60}
                  onClick={myTurn ? () => dispatch({ type: 'DRAFT', action: { type: 'TAKE', playerId: myId, cardId: card.id } }) : undefined}
                />
              ))}
            </div>
            {myTurn && !themed && (
              <div className="mt-4 flex items-center justify-center gap-4">
                <Btn
                  disabled={myTeam.rerollsLeft <= 0}
                  onClick={() => dispatch({ type: 'DRAFT', action: { type: 'REROLL', playerId: myId } })}
                >
                  ↻ REROLL · {myTeam.rerollsLeft} LEFT
                </Btn>
                <span className="plate plate-faint !text-[9px]">TAP A CARD TO DRAFT</span>
              </div>
            )}
            {myTurn && themed && <p className="plate plate-faint mt-4 text-center !text-[9px]">TAP A CARD TO DRAFT</p>}
          </>
        ) : null}

        {!myTurn && !revealing && (
          <div className="mt-2 grid gap-1 text-center">
            <span className="plate animate-pulse !text-[9px]">WAITING FOR {turnPlayer?.name?.toUpperCase() ?? '...'}</span>
            {themed && draft.lastType && lastTypePlayer && (
              <span className="plate plate-faint !text-[9px]">
                {lastTypePlayer.name.toUpperCase()} TRIED “{draft.lastType.query.toUpperCase()}” ·{' '}
                {draft.lastType.outcome === 'no-match' ? 'WHO?' : draft.lastType.outcome.replace('-', ' ').toUpperCase()}
              </span>
            )}
            {draft.lastPick && lastPickPlayer && (
              <span className="plate plate-faint !text-[9px]">
                LAST PICK: {lastPickPlayer.name.toUpperCase()} TOOK '{String(draft.lastPick.season).slice(2)}{' '}
                {draft.lastPick.name.toUpperCase()} · {draft.lastPick.ovr} OVR
              </span>
            )}
          </div>
        )}
      </Sheet>

      <div className="grid gap-3 md:grid-cols-2">
        {draft.players.map((p) => {
          const team = draft.teams[p.id]
          return (
            <Sheet
              key={p.id}
              title={`${p.name}${p.id === myId ? ' (YOU)' : ''}${p.isCpu ? ' · CPU' : ''}`}
              right={
                themed ? (
                  p.isCpu ? undefined : <StrikeDots left={team.strikesLeft} />
                ) : (
                  <span className="plate plate-faint !text-[9px]">↻ {team.rerollsLeft}</span>
                )
              }
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
