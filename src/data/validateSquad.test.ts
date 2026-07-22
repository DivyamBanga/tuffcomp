import { beforeAll, describe, expect, it } from 'vitest'
import { FORMATION_433, FORMATIONS } from '../engine/formations'
import type { Player, Position, Squad } from '../types'
import { loadSquads } from './loadSquads'
import { canFillFormation, validateSquad } from './validateSquad'

function makePlayer(id: string, positions: Position[]): Player {
  return {
    id,
    name: id,
    nation: 'Test',
    year: 2000,
    overall: 70,
    positions,
    attributes: { pace: 60, shooting: 60, passing: 60, dribbling: 60, defending: 60, physical: 60 },
  }
}

describe('real World Cup squad dataset', () => {
  let squads: Squad[] = []

  beforeAll(async () => {
    squads = await loadSquads()
  })

  it('loads a large real dataset', () => {
    expect(squads.length).toBeGreaterThan(100)
  })

  it('every squad has a unique id', () => {
    const ids = squads.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every player id is globally unique', () => {
    const ids = squads.flatMap((s) => s.players.map((p) => p.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every squad can fill the 4-3-3 formation', () => {
    const failures = squads.filter((s) => !canFillFormation(s, FORMATION_433)).map((s) => s.id)
    expect(failures).toEqual([])
  })

  it('flags a squad missing a goalkeeper as unable to fill the formation', () => {
    const broken = {
      ...squads[0],
      players: squads[0].players.filter((p) => !p.positions.includes('GK')),
    }
    const errors = validateSquad(broken, FORMATIONS)
    expect(errors.length).toBe(FORMATIONS.length)
  })

  it('cannot fill forward slots from a squad with no midfielders or forwards', () => {
    const defenseOnly: Squad = {
      id: 'test-defense-only',
      team: 'Test',
      year: 2000,
      kind: 'nation',
      players: [
        makePlayer('gk', ['GK']),
        ...Array.from({ length: 8 }, (_, i) => makePlayer(`def${i}`, ['DEF'])),
      ],
    }
    // Defenders can stretch into midfield, but defense and attack never connect directly.
    expect(canFillFormation(defenseOnly, FORMATION_433)).toBe(false)
  })
})
