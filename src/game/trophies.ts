// The trophy case: every finished championship, persisted locally.
export interface Trophy {
  id: string
  wonAt: string
  championName: string
  championWasMe: boolean
  finalsMvpName: string | null
  seasonMvpName: string | null
  format: string
  leagueSize: number
}

const KEY = 'ringchasers:trophies:v1'
const MAX = 50

export function loadTrophies(): Trophy[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTrophy(trophy: Trophy): Trophy[] {
  const next = [trophy, ...loadTrophies()].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage unavailable - trophy case just won't persist
  }
  return next
}
