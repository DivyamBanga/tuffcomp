import type { RatingBreakdown } from '../engine/rating'

export interface SavedResultPlayer {
  slotLabel: string
  name: string
  nation: string
  overall: number
}

export interface SavedResult extends RatingBreakdown {
  id: string
  playedAt: string
  isNewBest: boolean
  players: SavedResultPlayer[]
}

export const STORAGE_KEY = 'tuffcomp:history:v1'
const MAX_HISTORY = 50

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function loadHistory(): SavedResult[] {
  if (!hasLocalStorage()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHistory(history: SavedResult[]): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
  } catch {
    // localStorage unavailable (private browsing, quota exceeded) - not fatal to gameplay
  }
}

export function bestRating(history: SavedResult[]): number | null {
  if (history.length === 0) return null
  return Math.max(...history.map((h) => h.rating))
}
