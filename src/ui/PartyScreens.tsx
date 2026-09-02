import { useEffect, useMemo, useState } from 'react'
import { loadCards } from '../data/loadCards'
import { canPlaySlot, STARTER_SLOTS, type SlotId } from '../engine/lineup'
import type { MatchState } from '../game/match'
import {
  budgetTurnId,
  feasibleBudgetPicks,
  maxBid,
  type AuctionState,
  type BudgetState,
  type PartyTeamState,
} from '../game/party'
import { useGame } from '../game/store'
import { themeById } from '../game/themes'
import type { Card } from '../types'
import { Btn, MiniCard, NumTick, PlayerCard, Sheet, StatusLine } from './components'

function usePool(): Card[] | null {
  const [pool, setPool] = useState<Card[] | null>(useGame.getState().pool)
  useEffect(() => {
    if (pool) return
    let live = true
    void loadCards().then((cards) => {
      if (live) setPool(cards)
    })
    return () => {
      live = false
    }
  }, [pool])
  return pool
}

function ThemeHeader({ themeId, positionless }: { themeId: string; positionless: boolean }) {
  const theme = themeById(themeId)
  return (
    <div className="text-center">
      <p className="headline text-2xl text-ink sm:text-3xl">{theme.label}</p>
      <p className="mt-1 text-[12px] text-dim">{theme.detail}</p>
      {positionless && <p className="plate plate-faint mt-1 !text-[8.5px]">POSITIONLESS · ANYONE PLAYS ANYWHERE</p>}
    </div>
  )
}

// Every wallet in the room: money left, slots left, whose turn/lead.
function WalletRow({
  teams,
  players,
  hotId,
}: {
  teams: Record<string, PartyTeamState>
  players: { id: string; name: string }[]
  hotId: string | null
}) {
  const { myId } = useGame()
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {players.map((p) => {
        const team = teams[p.id]
        const open = STARTER_SLOTS.filter((s) => team.roster[s] === null).length
        return (
          <span
            key={p.id}
            className={`flex items-baseline gap-2 border px-2.5 py-1 ${
              p.id === hotId ? 'border-hot bg-paper2' : 'border-line'
            }`}
          >
            <span className="headline text-[13px] text-ink">{p.id === myId ? 'YOU' : p.name}</span>
            <span className="num text-[13px] font-bold text-gold">${team.budget}</span>
            <span className="num text-[9px] text-faint">{open} LEFT</span>
          </span>
        )
      })}
    </div>
  )
}

// AUTO or a tapped open starter slot for the incoming player.
function PartySlotPicker({
  team,
  chosen,
  onChoose,
}: {
  team: PartyTeamState
  chosen: SlotId | null
  onChoose: (slot: SlotId | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <Btn on={chosen === null} onClick={() => onChoose(null)} className="!px-2.5 !py-1 !text-[10px]">
        AUTO
      </Btn>
      {STARTER_SLOTS.map((slot) => (
        <Btn
          key={slot}
          on={chosen === slot}
          disabled={team.roster[slot] !== null}
          onClick={() => onChoose(chosen === slot ? null : slot)}
          className="!px-2.5 !py-1 !text-[10px]"
        >
          {slot}
        </Btn>
      ))}
    </div>
  )
}

function SquadSheets({ state }: { state: BudgetState | AuctionState }) {
  const { myId } = useGame()
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {state.players.map((p) => (
        <Sheet key={p.id} title={p.id === myId ? 'YOUR SQUAD' : p.name}>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {STARTER_SLOTS.map((slot) => (
              <MiniCard key={slot} label={slot} card={state.teams[p.id].roster[slot]} />
            ))}
          </div>
        </Sheet>
      ))}
    </div>
  )
}

// ---------------------------------------------------------- dollar table

export function BudgetScreen({ match }: { match: MatchState }) {
  const { myId, dispatch } = useGame()
  const pool = usePool()
  const party = match.party as BudgetState
  const turnId = budgetTurnId(party)
  const myTurn = turnId === myId
  const [chosenSlot, setChosenSlot] = useState<SlotId | null>(null)

  useEffect(() => setChosenSlot(null), [party.pickIndex])

  const feasibleIds = useMemo(() => {
    if (!pool || !myTurn) return new Set<string>()
    return new Set(feasibleBudgetPicks(party, { pool }, myId).map((e) => e.card.id))
  }, [pool, party, myId, myTurn])

  if (!pool) return <p className="plate animate-pulse py-16 text-center !text-[10px]">SETTING THE TABLE…</p>

  const card = (id: string) => pool.find((c) => c.id === id)!
  const turnPlayer = party.players.find((p) => p.id === turnId)
  const lastPlayer = party.players.find((p) => p.id === party.lastPick?.playerId)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-3 py-5">
      <StatusLine
        text={`DOLLAR TABLE · $${party.teams[myId]?.budget ?? 0} LEFT · PICK ${party.pickIndex + 1}/${party.order.length}${
          myTurn ? ' · YOU ARE UP' : ` · ${turnPlayer?.name ?? ''} IS UP`
        }`}
      />

      <Sheet>
        <ThemeHeader themeId={party.theme!} positionless={party.positionless} />
        <div className="mt-3">
          <WalletRow teams={party.teams} players={party.players} hotId={turnId} />
        </div>
        {party.lastPick && lastPlayer && (
          <p className="plate plate-faint mt-2 text-center !text-[9px]">
            {lastPlayer.name.toUpperCase()} → '{String(party.lastPick.season).slice(2)}{' '}
            {party.lastPick.name.toUpperCase()} · ${party.lastPick.price}
          </p>
        )}
        {myTurn && (
          <div className="mt-3">
            <PartySlotPicker team={party.teams[myId]} chosen={chosenSlot} onChoose={setChosenSlot} />
          </div>
        )}
      </Sheet>

      {party.tiers.map((tier) => (
        <Sheet key={tier.price} title={`$${tier.price} SHELF · ${tier.cardIds.length} LEFT`} pad={false}>
          <div className="flex gap-3 overflow-x-auto px-3 py-3">
            {tier.cardIds.map((id) => {
              const c = card(id)
              const takeable = myTurn && feasibleIds.has(id)
              return (
                <div key={id} className="relative shrink-0">
                  <PlayerCard
                    card={c}
                    dimmed={myTurn && !takeable}
                    onClick={
                      takeable
                        ? () =>
                            dispatch({
                              type: 'PARTY',
                              action: { type: 'BUDGET_PICK', playerId: myId, cardId: id, ...(chosenSlot ? { slot: chosenSlot } : {}) },
                            })
                        : undefined
                    }
                  />
                  <span className="num absolute -left-1 -top-1 border border-gold bg-paper px-1.5 py-0.5 text-[11px] font-bold text-gold">
                    ${tier.price}
                  </span>
                </div>
              )
            })}
          </div>
        </Sheet>
      ))}

      <SquadSheets state={party} />
    </div>
  )
}

// -------------------------------------------------------------- auction

const STAGE_LINES: Record<string, string> = {
  once: 'GOING ONCE…',
  twice: 'GOING TWICE…',
}

// The mystery block: a faceless card and the clues out so far.
function ClueBlock({ clues, total }: { clues: string[]; total: number }) {
  const locked = Math.max(0, total - clues.length)
  return (
    <div className="pcard w-full max-w-sm">
      <div className="photo-well flex h-24 items-center justify-center">
        <span className="num text-6xl font-bold text-faint">?</span>
      </div>
      <div className="grid gap-1.5 px-3 pb-3 pt-2">
        {clues.map((text, i) => (
          <p key={i} className="animate-deal flex items-baseline gap-2 text-[13px] font-semibold leading-snug text-ink" style={{ animationDelay: `${i * 80}ms` }}>
            <span className="num shrink-0 text-[9px] text-faint">{String(i + 1).padStart(2, '0')}</span>
            <span>{text}</span>
          </p>
        ))}
        {locked > 0 ? (
          <p className="plate plate-faint mt-1 !text-[8.5px]">
            {locked} MORE {locked === 1 ? 'CLUE' : 'CLUES'} LOCKED · EVERY BID REVEALS ONE
          </p>
        ) : (
          <p className="plate plate-faint mt-1 !text-[8.5px]">ALL CLUES OUT · TRUST YOUR GUT</p>
        )}
      </div>
    </div>
  )
}

export function AuctionScreen({ match }: { match: MatchState }) {
  const { myId, dispatch } = useGame()
  const pool = usePool()
  const party = match.party as AuctionState
  const lot = party.lot
  const [raise, setRaise] = useState<number | null>(null)

  useEffect(() => setRaise(null), [lot?.cardId, lot?.price])

  if (!pool) return <p className="plate animate-pulse py-16 text-center !text-[10px]">OPENING THE FLOOR…</p>

  const mystery = party.mystery
  // A guest's copy of an open mystery lot carries no card id at all.
  const card = lot && lot.cardId ? (pool.find((c) => c.id === lot.cardId) ?? null) : null
  const visibleClues = lot ? (lot.clues ?? []).slice(0, lot.shown ?? 0) : []
  const revealed = party.lastResult ? (pool.find((c) => c.id === party.lastResult!.cardId) ?? null) : null
  const myTeam = party.teams[myId]
  const leader = party.players.find((p) => p.id === lot?.leaderId)
  const iLead = lot?.leaderId === myId
  const iPassed = lot ? lot.passed.includes(myId) : false
  const myMax = myTeam ? maxBid(myTeam) : 0
  const minNext = lot ? (lot.leaderId === null ? 1 : lot.price + 1) : 0
  const openSlotFits = myTeam
    ? mystery
      ? STARTER_SLOTS.some((s) => myTeam.roster[s] === null)
      : !!card && STARTER_SLOTS.some((s) => myTeam.roster[s] === null && (party.positionless || canPlaySlot(card, s)))
    : false
  const canAct = !!lot && !!myTeam && !iLead && !iPassed && openSlotFits && minNext <= myMax
  const bidAmount = Math.min(Math.max(raise ?? minNext, minNext), myMax)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-3 py-5">
      <StatusLine text={`${mystery ? 'MYSTERY AUCTION' : 'AUCTION'} · $${myTeam?.budget ?? 0} LEFT · LOT ${party.lotIndex}`} />

      <Sheet>
        <ThemeHeader themeId={party.theme!} positionless={party.positionless} />
        <div className="mt-3">
          <WalletRow teams={party.teams} players={party.players} hotId={lot?.leaderId ?? null} />
        </div>
      </Sheet>

      {lot && (mystery || card) && (
        <Sheet>
          <div className="flex flex-col items-center gap-3">
            {lot.stage !== 'open' && (
              <p className="headline animate-pulse text-2xl text-hot">{STAGE_LINES[lot.stage]}</p>
            )}
            {mystery ? (
              <ClueBlock clues={visibleClues} total={lot.clues?.length ?? visibleClues.length} />
            ) : (
              <PlayerCard card={card!} />
            )}
            <div className="flex items-baseline gap-3">
              {lot.leaderId === null ? (
                <span className="plate !text-[10px]">NO BIDS YET · $1 OPENS IT</span>
              ) : (
                <>
                  <NumTick value={`$${lot.price}`} gold size="text-4xl" />
                  <span className="headline text-lg text-ink">
                    {iLead ? 'YOU LEAD' : leader?.name?.toUpperCase()}
                  </span>
                </>
              )}
            </div>

            {canAct ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Btn primary onClick={() => dispatch({ type: 'PARTY', action: { type: 'AUCTION_BID', playerId: myId, amount: bidAmount } })}>
                  BID ${bidAmount}
                </Btn>
                <span className="flex items-center gap-1">
                  <Btn disabled={bidAmount <= minNext} onClick={() => setRaise(bidAmount - 1)} className="!px-2.5 !py-1.5">
                    −
                  </Btn>
                  <Btn disabled={bidAmount >= myMax} onClick={() => setRaise(bidAmount + 1)} className="!px-2.5 !py-1.5">
                    +
                  </Btn>
                </span>
                <Btn onClick={() => dispatch({ type: 'PARTY', action: { type: 'AUCTION_PASS', playerId: myId } })}>
                  PASS
                </Btn>
                <span className="plate plate-faint !text-[8.5px]">MAX ${myMax}</span>
              </div>
            ) : (
              <p className="plate plate-faint !text-[9px]">
                {iLead
                  ? 'THE ROOM IS THINKING…'
                  : iPassed
                    ? 'YOU PASSED THIS LOT'
                    : !openSlotFits
                      ? 'NO SPOT FOR HIM ON YOUR FIVE'
                      : minNext > myMax
                        ? 'PRICED OUT'
                        : 'WAITING…'}
              </p>
            )}
          </div>
        </Sheet>
      )}

      {party.lastResult && (
        <Sheet pad={false}>
          <div className="flex items-center gap-3 px-3 py-2.5">
            {revealed && (
              <div className="shrink-0 scale-[0.6] origin-left -mr-14">
                <PlayerCard card={revealed} />
              </div>
            )}
            <p className={`plate !text-[9.5px] ${mystery ? 'text-ink' : ''}`}>
              {mystery ? 'IT WAS… ' : ''}
              {party.lastResult.winnerName
                ? `'${String(revealed?.season ?? '').slice(2)} ${party.lastResult.name.toUpperCase()} · SOLD TO ${party.lastResult.winnerName.toUpperCase()} FOR $${party.lastResult.price}`
                : `'${String(revealed?.season ?? '').slice(2)} ${party.lastResult.name.toUpperCase()} · NOBODY BID · HE WALKS`}
            </p>
          </div>
        </Sheet>
      )}

      <SquadSheets state={party} />
    </div>
  )
}

export function PartyDraftScreen({ match }: { match: MatchState }) {
  return match.party!.kind === 'budget' ? <BudgetScreen match={match} /> : <AuctionScreen match={match} />
}
