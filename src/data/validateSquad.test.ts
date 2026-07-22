import { describe, expect, it } from 'vitest'
import { FORMATIONS } from '../engine/formations'
import type { Player, Position, Squad } from '../types'
import { SQUADS } from './loadSquads'
import { canFillFormation, validateSquad } from './validateSquad'

function makePlayer(id: string, positions: Position[]): Player {
  return {
    id,
    name: id,
    nation: 'Test',
    club: 'Test',
    league: 'Test',
    year: 2000,
    overall: 70,
    positions,
    attributes: { pace: 60, shooting: 60, passing: 60, dribbling: 60, defending: 60, physical: 60 },
  }
}

describe('curated squads', () => {
  it('loads at least 8 squads', () => {
    expect(SQUADS.length).toBeGreaterThanOrEqual(8)
  })

  it('every squad has a unique id', () => {
    const ids = SQUADS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every player id is globally unique', () => {
    const ids = SQUADS.flatMap((s) => s.players.map((p) => p.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const squad of SQUADS) {
    for (const formation of FORMATIONS) {
      it(`${squad.id} can fill ${formation.id}`, () => {
        expect(canFillFormation(squad, formation)).toBe(true)
      })
    }
  }

  it('flags a squad missing a goalkeeper as unable to fill any formation', () => {
    const broken = {
      ...SQUADS[0],
      players: SQUADS[0].players.filter((p) => !p.positions.includes('GK')),
    }
    const errors = validateSquad(broken, FORMATIONS)
    expect(errors.length).toBe(FORMATIONS.length)
  })

  it('cannot fill either formation when no player can cover an attacking slot', () => {
    const noAttackers: Squad = {
      id: 'test-no-attack',
      team: 'Test',
      year: 2000,
      kind: 'nation',
      players: [
        makePlayer('gk', ['GK']),
        makePlayer('cb1', ['CB']),
        makePlayer('cb2', ['CB']),
        makePlayer('lb', ['LB']),
        makePlayer('rb', ['RB']),
        makePlayer('cdm', ['CDM']),
        makePlayer('cm1', ['CM']),
        makePlayer('cm2', ['CM']),
        makePlayer('cm3', ['CM']),
      ],
    }
    for (const formation of FORMATIONS) {
      expect(canFillFormation(noAttackers, formation)).toBe(false)
    }
  })
})
