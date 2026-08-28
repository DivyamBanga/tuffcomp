import { useEffect, useRef, useState } from 'react'
import { loadCards } from '../data/loadCards'
import { currentRound, ROUNDS, type DraftState, type TypeFeedback } from '../game/draft'
import { THEMES, suggestNames, themeById } from '../game/themes'
import { useGame } from '../game/store'
import type { MatchState } from '../game/match'
import { ALL_SLOTS, type SlotId } from '../engine/lineup'
import type { Card } from '../types'
import { Btn, MiniCard, PlayerCard, Sheet, StatusLine } from './components'

const REVEAL_MS = 1400

function whiffText(feedback: TypeFeedback): string {
  const name = feedback.matchedName?.toUpperCase()
  switch (feedback.outcome) {
    case 'no-match':
      return 'WHO?'
    case 'off-theme':
      return `${name} DOESN'T FIT`
    case 'taken':
      return `${name} IS GONE`
    case 'cant-fit':
      return `${name} CAN'T FILL YOUR FIVE`
  }
}

// The draft's one theme deals itself once at the start.
function useThemeReveal() {
  const [revealing, setRevealing] = useState(true)
  const [decoy, setDecoy] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
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
  }, [])

  return { revealing, decoy }
}

// Where should the pick land? AUTO or a tapped open slot.
function SlotPicker({
  draft,
  myId,
  chosen,
  onChoose,
}: {
  draft: DraftState
  myId: string
  chosen: SlotId | null
  onChoose: (slot: SlotId | null) => void
}) {
  const roster = draft.teams[myId].roster
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <Btn on={chosen === null} onClick={() => onChoose(null)} className="!px-2.5 !py-1 !text-[10px]">
        AUTO
      </Btn>
      {ALL_SLOTS.map((slot) => (
        <Btn
          key={slot}
          on={chosen === slot}
          disabled={roster[slot] !== null}
          onClick={() => onChoose(chosen === slot ? null : slot)}
          className="!px-2.5 !py-1 !text-[10px]"
        >
          {slot}
        </Btn>
      ))}
    </div>
  )
}

// ------------------------------------------------------------- type-in form

function TypePickForm({ draft, myId, slot }: { draft: DraftState; myId: string; slot: SlotId | null }) {
  const { dispatch, sendTyping } = useGame()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const [pool, setPool] = useState<Card[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const feedback = draft.lastType?.playerId === myId ? draft.lastType : null

  // Autocomplete index - spelling help over ALL players, never filtered
  // to the theme.
  useEffect(() => {
    let live = true
    void loadCards().then((cards) => {
      if (live) setPool(cards)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    setQuery('')
    setHighlight(-1)
    inputRef.current?.focus()
  }, [draft.pickIndex])

  const suggestions = pool && query.trim().length >= 2 ? suggestNames(pool, query) : []

  function callName(name: string) {
    if (name.trim().length < 2) return
    setHighlight(-1)
    dispatch({ type: 'DRAFT', action: { type: 'TYPE_PICK', playerId: myId, query: name.trim(), ...(slot ? { slot } : {}) } })
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
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-4">
      <div key={feedback?.attempt ?? 0} className={`w-full ${feedback ? 'animate-shake' : ''}`}>
        <div className="relative">
          <div className="flex items-end gap-3">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                const text = e.target.value.slice(0, 32)
                setQuery(text)
                setHighlight(-1)
                sendTyping(text)
              }}
              onKeyDown={onKeyDown}
              placeholder="type a name"
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
        <span className="plate plate-faint !text-[8.5px]">UNLIMITED CALLS · NAME ONE WHO FITS</span>
        {feedback && <p className="plate !text-[10px] !tracking-[0.1em] text-ink">{whiffText(feedback)}</p>}
      </div>
    </div>
  )
}

// -------------------------------------------------------------- whiff feed

// The draft's public record of wrong calls, newest first. Solo included -
// your shame has a memory.
function WhiffFeed({ draft }: { draft: DraftState }) {
  if (draft.whiffs.length === 0) return null
  const nameOf = (id: string) => draft.players.find((p) => p.id === id)?.name ?? '???'
  const recent = [...draft.whiffs].reverse().slice(0, 6)
  return (
    <Sheet title={`WHIFF LEDGER · ${draft.whiffs.length}`} pad={false}>
      <div>
        {recent.map((w, i) => (
          <p key={`${w.playerId}-${w.attempt}-${i}`} className="num cell flex items-baseline gap-2 !py-1.5 text-[10.5px] text-dim">
            <span className="plate plate-faint shrink-0 !text-[8.5px]">{nameOf(w.playerId).toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate">“{w.query.toUpperCase()}”</span>
            <span className="shrink-0 text-ink">{whiffText(w)}</span>
          </p>
        ))}
      </div>
    </Sheet>
  )
}

// ------------------------------------------------------------------ screen

export function DraftScreen({ match }: { match: MatchState }) {
  const { myId, dispatch, liveTyping } = useGame()
  const draft = match.draft!
  const turnId = draft.order[draft.pickIndex]
  const turnPlayer = draft.players.find((p) => p.id === turnId)
  const myTurn = turnId === myId
  const round = currentRound(draft)
  const offer = draft.offer
  const theme = themeById(draft.theme!)
  const solo = draft.players.length === 1

  const { revealing, decoy } = useThemeReveal()
  const [chosenSlot, setChosenSlot] = useState<SlotId | null>(null)

  useEffect(() => setChosenSlot(null), [draft.pickIndex])

  const lastPickPlayer = draft.players.find((p) => p.id === draft.lastPick?.playerId)
  const ghost = !myTurn && liveTyping && liveTyping.playerId === turnId ? liveTyping.text : null

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-3 py-5">
      <StatusLine
        text={`PICK ${draft.pickIndex + 1}/${draft.order.length} · R${round}/${ROUNDS}${
          myTurn ? ' · YOU' : ` · ${turnPlayer?.name ?? ''}`
        }`}
      />

      <Sheet>
        <div className="mb-2 text-center">
          {revealing ? (
            <p className="headline text-3xl text-faint sm:text-4xl">{decoy || '· · ·'}</p>
          ) : (
            <>
              <p className="headline text-3xl text-ink sm:text-4xl">{theme.label}</p>
              <p className="mt-1.5 text-[13px] text-dim">{theme.detail}</p>
              {draft.positionless && (
                <p className="plate plate-faint mt-1.5 !text-[8.5px]">POSITIONLESS · ANYONE PLAYS ANYWHERE</p>
              )}
            </>
          )}
        </div>

        {revealing ? (
          <p className="plate animate-pulse py-8 text-center !text-[10px]">DEALING…</p>
        ) : (
          <>
            {myTurn && !draft.done && (
              <div className="mb-3">
                <SlotPicker draft={draft} myId={myId} chosen={chosenSlot} onChoose={setChosenSlot} />
              </div>
            )}

            {myTurn && !offer ? (
              <TypePickForm draft={draft} myId={myId} slot={chosenSlot} />
            ) : offer ? (
              <>
                {offer.themeFallback && <p className="plate mb-3 text-center !text-[9px]">THEME RAN DRY · OPEN BOARD</p>}
                <div className="flex flex-wrap justify-center gap-3">
                  {offer.cards.map((card, i) => (
                    <PlayerCard
                      key={card.id}
                      card={card}
                      delayMs={i * 60}
                      onClick={
                        myTurn
                          ? () =>
                              dispatch({
                                type: 'DRAFT',
                                action: { type: 'TAKE', playerId: myId, cardId: card.id, ...(chosenSlot ? { slot: chosenSlot } : {}) },
                              })
                          : undefined
                      }
                    />
                  ))}
                </div>
              </>
            ) : null}

            {!myTurn && (
              <div className="mt-2 grid gap-1 text-center">
                <span className="plate animate-pulse !text-[9px]">{turnPlayer?.name?.toUpperCase() ?? '...'} IS UP</span>
                {ghost !== null && (
                  <p className="headline text-2xl text-faint">
                    {ghost.toUpperCase() || '…'}
                    <span className="animate-pulse text-hot">▏</span>
                  </p>
                )}
                {draft.lastPick && lastPickPlayer && (
                  <span className="plate plate-faint !text-[9px]">
                    {lastPickPlayer.name.toUpperCase()} → '{String(draft.lastPick.season).slice(2)}{' '}
                    {draft.lastPick.name.toUpperCase()} · {draft.lastPick.ovr}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </Sheet>

      <WhiffFeed draft={draft} />

      <div className={`grid gap-3 ${solo ? '' : 'md:grid-cols-2'}`}>
        {draft.players.map((p) => {
          const team = draft.teams[p.id]
          return (
            <Sheet
              key={p.id}
              title={p.id === myId ? 'YOUR SQUAD' : p.name}
              className={p.id === turnId && !solo ? '!border-hot' : ''}
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
