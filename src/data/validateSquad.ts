import type { Formation } from '../engine/formations'
import { bestCompatibility } from '../engine/positions'
import type { Squad } from '../types'

// Bipartite max-matching (Kuhn's algorithm): can every slot in the formation
// be assigned a distinct, legally-eligible player from the squad?
export function canFillFormation(squad: Squad, formation: Formation): boolean {
  const players = squad.players
  const matchedPlayerToSlot = new Array(players.length).fill(-1)

  function tryAssignSlot(slotIndex: number, visited: boolean[]): boolean {
    for (let p = 0; p < players.length; p++) {
      if (visited[p]) continue
      if (bestCompatibility(players[p].positions, formation.slots[slotIndex].position) <= 0) continue
      visited[p] = true
      if (matchedPlayerToSlot[p] === -1 || tryAssignSlot(matchedPlayerToSlot[p], visited)) {
        matchedPlayerToSlot[p] = slotIndex
        return true
      }
    }
    return false
  }

  let filled = 0
  for (let s = 0; s < formation.slots.length; s++) {
    const visited = new Array(players.length).fill(false)
    if (tryAssignSlot(s, visited)) filled++
  }
  return filled === formation.slots.length
}

export function validateSquad(squad: Squad, formations: Formation[]): string[] {
  const errors: string[] = []
  for (const formation of formations) {
    if (!canFillFormation(squad, formation)) {
      errors.push(`${squad.id} cannot fill formation ${formation.id}`)
    }
  }
  return errors
}
