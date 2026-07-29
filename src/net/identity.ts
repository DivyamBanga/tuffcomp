// Stable local identity so a guest can rejoin a room and reclaim their seat.
const ID_KEY = 'ringchasers:playerId'
const NAME_KEY = 'ringchasers:name'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable - identity just won't persist
  }
}

export function myPlayerId(): string {
  let id = safeGet(ID_KEY)
  if (!id) {
    id = `p-${crypto.randomUUID().slice(0, 8)}`
    safeSet(ID_KEY, id)
  }
  return id
}

export function savedName(): string {
  return safeGet(NAME_KEY) ?? ''
}

export function saveName(name: string) {
  safeSet(NAME_KEY, name)
}
