import type { Card, Pos } from '../types'
import { POSITIONS } from '../types'

// A drafted team: five positional starter slots plus three flex bench slots.
export const STARTER_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
export const BENCH_SLOTS = ['B1', 'B2', 'B3'] as const
export type StarterSlot = (typeof STARTER_SLOTS)[number]
export type BenchSlot = (typeof BENCH_SLOTS)[number]
export type SlotId = StarterSlot | BenchSlot

export const ALL_SLOTS: SlotId[] = [...STARTER_SLOTS, ...BENCH_SLOTS]
export const TEAM_SIZE = ALL_SLOTS.length

export type Roster = Record<SlotId, Card | null>

export function emptyRoster(): Roster {
  return { PG: null, SG: null, SF: null, PF: null, C: null, B1: null, B2: null, B3: null }
}

export const NATURAL = 1
export const STRETCH = 0.55
export const ILLEGAL = 0

// Neighboring positions can cover each other at a discount; two or more
// steps apart is illegal (no centers running point).
function positionCompat(pos: Pos, slot: Pos): number {
  const distance = Math.abs(POSITIONS.indexOf(pos) - POSITIONS.indexOf(slot))
  if (distance === 0) return NATURAL
  if (distance === 1) return STRETCH
  return ILLEGAL
}

// Best compatibility considering the card's secondary position.
export function slotCompat(card: Card, slot: SlotId): number {
  if (slot === 'B1' || slot === 'B2' || slot === 'B3') return NATURAL
  const primary = positionCompat(card.pos, slot)
  const secondary = card.pos2 ? positionCompat(card.pos2, slot) : ILLEGAL
  return Math.max(primary, secondary)
}

export function canPlaySlot(card: Card, slot: SlotId): boolean {
  return slotCompat(card, slot) > ILLEGAL
}

export function eligibleSlots(card: Card): SlotId[] {
  return ALL_SLOTS.filter((slot) => canPlaySlot(card, slot))
}

export function rosterCards(roster: Roster): Card[] {
  return ALL_SLOTS.map((slot) => roster[slot]).filter((c): c is Card => c !== null)
}

export function starters(roster: Roster): Card[] {
  return STARTER_SLOTS.map((slot) => roster[slot]).filter((c): c is Card => c !== null)
}

export function isComplete(roster: Roster): boolean {
  return rosterCards(roster).length === TEAM_SIZE
}

// Can this set of cards legally fill PG..C plus bench? (Bipartite matching
// over the five starter slots; bench takes anyone, so only starters bind.)
export function canFieldStarters(cards: Card[]): boolean {
  const slots = [...STARTER_SLOTS]
  const matchedCardForSlot = new Array<number>(slots.length).fill(-1)

  function tryAssign(cardIdx: number, visited: boolean[]): boolean {
    for (let s = 0; s < slots.length; s++) {
      if (visited[s] || !canPlaySlot(cards[cardIdx], slots[s])) continue
      visited[s] = true
      if (matchedCardForSlot[s] === -1 || tryAssign(matchedCardForSlot[s], visited)) {
        matchedCardForSlot[s] = cardIdx
        return true
      }
    }
    return false
  }

  let placed = 0
  for (let i = 0; i < cards.length; i++) {
    const visited = new Array(slots.length).fill(false)
    if (tryAssign(i, visited)) placed++
  }
  return placed >= Math.min(slots.length, cards.length)
}
