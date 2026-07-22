import { POSITIONS } from '../engine/positions'
import type { Player, Position, Squad } from '../types'

import argentina2022 from './squads/argentina-2022.json'
import brazil1970 from './squads/brazil-1970.json'
import brazil2002 from './squads/brazil-2002.json'
import england2018 from './squads/england-2018.json'
import france2022 from './squads/france-2022.json'
import germany2014 from './squads/germany-2014.json'
import italy2006 from './squads/italy-2006.json'
import netherlands2010 from './squads/netherlands-2010.json'
import portugal2006 from './squads/portugal-2006.json'
import spain2010 from './squads/spain-2010.json'

const RAW_SQUADS: unknown[] = [
  argentina2022,
  brazil1970,
  brazil2002,
  england2018,
  france2022,
  germany2014,
  italy2006,
  netherlands2010,
  portugal2006,
  spain2010,
]

function isPosition(value: unknown): value is Position {
  return typeof value === 'string' && (POSITIONS as string[]).includes(value)
}

function assertPlayer(raw: unknown, squadId: string): Player {
  const p = raw as Player
  if (typeof p.id !== 'string' || !p.id) {
    throw new Error(`${squadId}: a player is missing an id`)
  }
  if (typeof p.overall !== 'number' || p.overall < 1 || p.overall > 99) {
    throw new Error(`${squadId}: ${p.id} has an invalid overall (${p.overall})`)
  }
  if (!Array.isArray(p.positions) || p.positions.length === 0) {
    throw new Error(`${squadId}: ${p.id} has no positions`)
  }
  for (const position of p.positions) {
    if (!isPosition(position)) {
      throw new Error(`${squadId}: ${p.id} has an unknown position "${position}"`)
    }
  }
  return p
}

function assertSquad(raw: unknown): Squad {
  const s = raw as Squad
  if (typeof s.id !== 'string' || !s.id) {
    throw new Error('a squad is missing an id')
  }
  if (!Array.isArray(s.players) || s.players.length === 0) {
    throw new Error(`${s.id}: squad has no players`)
  }
  for (const player of s.players) {
    assertPlayer(player, s.id)
  }
  return s
}

export const SQUADS: Squad[] = RAW_SQUADS.map(assertSquad)

export function getSquad(id: string): Squad | undefined {
  return SQUADS.find((s) => s.id === id)
}
